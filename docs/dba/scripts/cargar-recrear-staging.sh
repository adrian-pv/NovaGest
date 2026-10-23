#!/usr/bin/env bash
# Carga las claves rotadas en staging/.env y recrea la app UNA sola vez con la misma imagen.
# Exclusivamente Adrián, como root en daniel1, después de que el DBA anuncie DBA_LISTO.
#
#   bash cargar-recrear-staging.sh --plan
#   sudo bash cargar-recrear-staging.sh --comprobar sha256:<ID>   # solo lectura; también antes de la rotación
#   sudo bash cargar-recrear-staging.sh --aplicar sha256:<ID>     # solo tras DBA_LISTO
#
# Las claves salen de /run/novagest-rotacion-staging (las genera rotar-staging-coordinado.sh) y no se
# muestran. Sin pull, build, down ni segunda recreación. Códigos: 0 OK, 1 detenido sin recrear,
# 2 uso, 5 detenido después de recrear (diagnóstico enmascarado; no se reintenta).
set -Eeuo pipefail
umask 077

dir=/opt/tramites/staging
sec=/run/novagest-rotacion-staging
cid=novagest-staging-app-1
red=novagest-staging_default
dueno=deploy:deploy
privado=/root/novagest-recreacion
espera=180
intervalo=5

modo=${1:-}
id_previo=${2:-}
tmp_env=
snap=

uso() { echo "uso: $0 --plan | --comprobar sha256:<ID> | --aplicar sha256:<ID>" >&2; exit 2; }
die() { echo "DETENIDO: $*" >&2; exit 1; }
fallo() {
  local rc=$? linea=$1
  [[ $BASHPID == "$$" ]] || exit "$rc"   # en una sustitución de comandos informa el padre
  trap - ERR
  echo "FALLO: linea $linea de $(basename -- "$0") (codigo $rc)." >&2
  exit "$rc"
}
limpiar() {
  if [[ -n $tmp_env && -e $tmp_env ]]; then
    rm -f -- "$tmp_env"
    echo "Temporal .env.rotacion.* retirado; .env sin cambios." >&2
  fi
}
trap 'fallo $LINENO' ERR
trap limpiar EXIT
trap 'exit 130' INT TERM HUP

contar() { awk -v p="$1" '$0 ~ p { n++ } END { print n + 0 }' "$2"; }
envval() { awk -v k="$1=" 'index($0, k) == 1 { v = substr($0, length(k) + 1) } END { print v }' .env; }
resto_env() { awk '!/^(FLYWAY_PASSWORD|DB_PASSWORD)=/' "$1" | sha256sum; }
topologia() {
  docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{println $k $v.NetworkID}}{{end}}{{range .Mounts}}{{println .Type .Name .Source .Destination}}{{end}}' "$cid" | sort
}

if [[ $modo == --plan ]]; then
  cat <<EOF
Plan de cargar-recrear-staging.sh (no cambia nada):
 1. Toma el candado de staging ($dir/.lock) durante toda la operacion, como tramites-ctl.
 2. Comprueba .env y app.env ($dueno, modo 600, sin enlaces), una sola linea FLYWAY_PASSWORD= y DB_PASSWORD=,
    app.env sin contrasenas de base, current_tag, APP_PORT, y que el contenedor y la etiqueta usan el ID indicado.
 3. --aplicar: captura privada en $privado.* (ID de imagen, redes y montajes, huella del resto de .env).
 4. Carga FLYWAY_PASSWORD y DB_PASSWORD desde $sec en un temporal .env.rotacion.* (mismo dueno y modo)
    y lo sustituye de forma atomica solo si el resto de .env queda identico. Las claves no se muestran.
 5. Una sola recreacion: compose up -d --no-deps --no-build --pull never --force-recreate app.
 6. Misma imagen, mismas redes y montajes; espera hasta ${espera}s a que /actuator/health devuelva JSON con status UP.
 7. OK: anota en deploy.log con el formato de tramites-ctl y termina con ADRIAN_LISTO.
    Fallo tras recrear: codigo 5, diagnostico enmascarado (estado y hasta 80 lineas de log), sin segunda recreacion.
EOF
  exit 0
fi

(( $# == 2 )) || uso
[[ $modo == --comprobar || $modo == --aplicar ]] || uso
[[ $id_previo =~ ^sha256:[0-9a-f]{64}$ ]] || uso
(( EUID == 0 )) || die "ejecutar con sudo (root)"

[[ -d $dir && ! -L $dir ]] || die "no existe $dir"
cd -- "$dir"

# Una operacion a la vez: el mismo candado que tramites-ctl y los scripts del DBA.
[[ -f .lock && ! -L .lock ]] || die "falta el candado $dir/.lock"
exec 9<>.lock
flock -w 10 9 || die "candado de staging ocupado: hay otra operacion en curso"

archivo_privado() {
  [[ -f $1 && ! -L $1 ]] || die "$1 no es un archivo regular"
  [[ $(stat -c '%U:%G %a %h' -- "$1") == "$dueno 600 1" ]] || die "$1 debe ser de $dueno, modo 600 y sin enlaces duros"
}
archivo_privado .env
archivo_privado app.env
[[ -z $(tail -c 1 .env) ]] || die ".env no termina en salto de linea: anadirlo antes de la ventana (la carga conserva el resto byte a byte)"
[[ $(contar '^FLYWAY_PASSWORD=' .env) == 1 && $(contar '^DB_PASSWORD=' .env) == 1 ]] \
  || die ".env debe tener exactamente una linea FLYWAY_PASSWORD= y una DB_PASSWORD="
[[ $(contar '^(FLYWAY_PASSWORD|DB_PASSWORD|SPRING_FLYWAY_PASSWORD|SPRING_DATASOURCE_PASSWORD)=' app.env) == 0 ]] \
  || die "app.env no debe definir contrasenas de base: Compose las toma de .env"
[[ -f current_tag && ! -L current_tag ]] || die "falta current_tag"
tag=$(head -n 1 current_tag)
[[ $tag =~ ^[0-9a-f]{7,64}$ ]] || die "current_tag invalido"
port=$(envval APP_PORT)
[[ $port =~ ^[0-9]{2,5}$ ]] || die "APP_PORT invalido en .env"
[[ ! -e deploy.log || ( -f deploy.log && ! -L deploy.log ) ]] || die "deploy.log no es un archivo regular"

compose=(docker compose --project-directory "$dir" -f "$dir/compose.yaml" --env-file "$dir/.env")
export APP_TAG=$tag   # compose.yaml lo exige en todas sus llamadas, como en tramites-ctl

ref=$(docker inspect -f '{{.Config.Image}}' "$cid") || die "no existe el contenedor $cid"
actual=$(docker inspect -f '{{.Image}}' "$cid")
[[ $actual == "$id_previo" ]] || die "el contenedor corre $actual, no el ID indicado"
[[ $(docker image inspect -f '{{.Id}}' "$ref") == "$id_previo" ]] \
  || die "la etiqueta $ref ya apunta a otra imagen: recrear cambiaria la version"
docker network inspect "$red" >/dev/null || die "no existe la red $red"

# El JSON de config lleva las claves interpoladas: solo transita por la tuberia hacia el filtro.
revisar_config() {
  "${compose[@]}" config --format json | python3 -I -c '
import json, sys
app = json.load(sys.stdin)["services"]["app"]
ok = app["image"] == sys.argv[1]
if len(sys.argv) > 2:
    clave = lambda v: open(sys.argv[2] + "/" + v).read().strip()
    env = app.get("environment") or {}
    ok = ok and env.get("SPRING_FLYWAY_PASSWORD") == clave("FLYWAY_PASSWORD") and env.get("DB_PASSWORD") == clave("DB_PASSWORD")
sys.exit(0 if ok else 1)' "$ref" "$@"
}
revisar_config || die "compose config no usa la imagen $ref para app"

claves_listas() {
  [[ -d $sec && ! -L $sec && -O $sec && $(stat -c %a -- "$sec") == 700 ]] || return 1
  local v
  for v in FLYWAY_PASSWORD DB_PASSWORD; do
    [[ -f $sec/$v && ! -L $sec/$v && -O $sec/$v && $(stat -c %a -- "$sec/$v") == 600 ]] || return 1
    grep -Eqx '[0-9a-f]{64}' "$sec/$v" && [[ $(wc -l <"$sec/$v") -le 1 ]] || return 1
  done
}

salud_up() {
  curl -sS --max-time 3 "http://127.0.0.1:$port/actuator/health" 2>/dev/null | python3 -I -c '
import json, sys
try:
    d = json.load(sys.stdin)
except ValueError:
    sys.exit(1)
sys.exit(0 if isinstance(d, dict) and d.get("status") == "UP" else 1)'
}

copias=$(find . -maxdepth 1 -type f \( -name '.env.*' -o -name 'app.env.*' \) ! -name '.env.rotacion.*' -printf '%f\n' | sort | tr '\n' ' ')
[[ -z $copias ]] || echo "AVISO: copias de entorno que pueden conservar claves en $dir: $copias(retirarlas tras la verificacion final, con autorizacion)"
restos=$(find . -maxdepth 1 -type f -name '.env.rotacion.*' -printf '%f ')

if [[ $modo == --comprobar ]]; then
  [[ -z $restos ]] || echo "AVISO: temporales de una carga interrumpida (--aplicar los retira): $restos"
  if claves_listas; then echo "Claves de la ventana: presentes y con permisos correctos."
  else echo "Claves de la ventana: aun no disponibles en $sec (normal antes de DBA_LISTO)."; fi
  if salud_up; then echo "Health actual: UP"; else echo "Health actual: sin UP"; fi
  printf 'Redes y montajes actuales:\n%s\n' "$(topologia)"
  echo "COMPROBACION OK: $cid con $id_previo, etiqueta $tag, candado libre. No se modifico nada."
  exit 0
fi

claves_listas || die "no hay claves vigentes y protegidas en $sec: esperar DBA_LISTO"
if [[ -n $restos ]]; then
  find . -maxdepth 1 -type f -name '.env.rotacion.*' -delete
  echo "Retirados temporales de una carga interrumpida: $restos"
fi

snap=$(mktemp -d "$privado.XXXXXXXX")
printf '%s\n' "$id_previo" >"$snap/imagen-id.txt"
viejo=$(docker inspect -f '{{.Id}}' "$cid")
topologia >"$snap/topologia-antes.txt"
resto_env .env >"$snap/resto-env-antes.sha256"

# Carga: un .env nuevo en el mismo directorio y sustitucion atomica. Sin copia del .env anterior.
tmp_env=$(mktemp "$dir/.env.rotacion.XXXXXXXX")
awk -v d="$sec" '
  BEGIN { if ((getline f < (d "/FLYWAY_PASSWORD")) <= 0 || (getline a < (d "/DB_PASSWORD")) <= 0) { err = 1; exit } }
  /^FLYWAY_PASSWORD=/ { print "FLYWAY_PASSWORD=" f; nf++; next }
  /^DB_PASSWORD=/ { print "DB_PASSWORD=" a; na++; next }
  { print }
  END { if (err) exit 4; if (nf != 1 || na != 1) exit 3 }' .env >"$tmp_env"
[[ $(resto_env "$tmp_env") == "$(<"$snap/resto-env-antes.sha256")" ]] || die "el resto de .env cambiaria: no se sustituye"
chown --reference=.env -- "$tmp_env"
chmod --reference=.env -- "$tmp_env"
archivo_privado "$tmp_env"
mv -f -- "$tmp_env" .env
tmp_env=
revisar_config "$sec" || die "tras la carga, compose config no entrega las claves vigentes a app; no se recrea"
echo "OK: .env actualizado (solo FLYWAY_PASSWORD y DB_PASSWORD; resto identico)."

registrar() {
  if [[ ! -e deploy.log ]]; then
    install -m "$(stat -c %a current_tag)" -o "$(stat -c %U current_tag)" -g "$(stat -c %G current_tag)" /dev/null deploy.log
  fi
  printf '%s | staging | %s | %s\n' "$(date -u '+%FT%TZ')" "$1" "${SUDO_USER:-$(id -un)}" >>deploy.log
}
enmascarar() {
  python3 -I -c '
import re, sys
claves = [open(sys.argv[1] + "/" + v).read().strip() for v in ("FLYWAY_PASSWORD", "DB_PASSWORD")]
patron = re.compile(r"(?i)((?:password|passwd|pwd|secret|token|credential)[\w.-]*\"?\s*[:=]\s*)(\"[^\"]*\"|\S+)")
for n, linea in enumerate(sys.stdin):
    if n >= 80:
        break
    for c in claves:
        linea = linea.replace(c, "[CLAVE-OCULTA]")
    sys.stdout.write(patron.sub(r"\1[OCULTO]", linea))' "$sec"
}
fallo_tras_recrear() {
  trap - ERR
  set +e
  echo "DETENIDO tras la recreacion: $1" >&2
  {
    echo "== $(date -u '+%FT%TZ') $1"
    docker inspect -f 'estado={{.State.Status}} reinicios={{.RestartCount}} salida={{.State.ExitCode}} inicio={{.State.StartedAt}} fin={{.State.FinishedAt}} imagen={{.Image}}' "$cid" 2>&1
    echo "== ultimas 80 lineas del log de app (enmascaradas)"
    "${compose[@]}" logs --no-color --tail 80 app 2>&1 | enmascarar
  } | tee "$snap/diagnostico.txt"
  registrar "rotacion-credenciales FALLÓ $tag (imagen $id_previo; $1)"
  echo "No se hizo una segunda recreacion. .env ya tiene las claves vigentes de $sec. Avisar al DBA; diagnostico privado en $snap/diagnostico.txt" >&2
  exit 5
}

"${compose[@]}" up -d --no-deps --no-build --pull never --force-recreate app || fallo_tras_recrear "compose up termino con error"
nuevo=$(docker inspect -f '{{.Id}}' "$cid") || fallo_tras_recrear "no aparece $cid tras recrear"
[[ $nuevo != "$viejo" ]] || fallo_tras_recrear "el contenedor no se recreo"
[[ $(docker inspect -f '{{.Image}}' "$cid") == "$id_previo" ]] || fallo_tras_recrear "la imagen cambio al recrear"
topologia >"$snap/topologia-despues.txt"
cmp -s "$snap/topologia-antes.txt" "$snap/topologia-despues.txt" || fallo_tras_recrear "redes o montajes cambiaron al recrear"

t=0
until salud_up; do
  estado=$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null) || estado=ausente
  case $estado in exited|dead|ausente) fallo_tras_recrear "el contenedor quedo $estado" ;; esac
  (( t < espera )) || fallo_tras_recrear "health no devolvio JSON con status UP en ${espera}s"
  sleep "$intervalo"
  t=$(( t + intervalo ))
done

registrar "rotacion-credenciales OK $tag (imagen $id_previo sin cambios; FLYWAY_PASSWORD y DB_PASSWORD nuevas; health UP)"
echo "ADRIAN_LISTO: recreacion unica con $id_previo, mismas redes y montajes, health UP en ~${t}s. Captura privada: $snap"
