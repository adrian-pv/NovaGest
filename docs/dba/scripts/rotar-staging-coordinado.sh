#!/usr/bin/env bash
# PREPARADO, NO EJECUTADO. Solo cambia contrasenas de los dos roles de staging.
# Cada clave nueva (256 bits, hex) nace en el servidor dentro de un directorio tmpfs solo-root;
# PostgreSQL recibe el verificador SCRAM, nunca la clave, y Adrian toma la clave del mismo archivo.
# Las claves no pasan por pantalla, argumentos, variables del shell, logs, reportes ni Git.
# Nunca lee/escribe .env/app.env, ni llama Docker, tramites-ctl o servicios.
set +x
set -euo pipefail
umask 077

sec=/run/novagest-rotacion-staging

plan() {
  cat <<'TXT'
Plan: Deploy pausado y sin jobs activos; ventana y sesion conjunta confirmadas.
DBA: candado de staging; migrador: clave nueva generada aqui, verificador SCRAM y conexion nueva TLS;
despues app igual; verificacion conjunta de ambas; libera candado y entrega a Adrian.
Las claves vigentes quedan en /run/novagest-rotacion-staging (root, 700, tmpfs) hasta la verificacion final.
Adrian: actualiza solo FLYWAY_PASSWORD y DB_PASSWORD desde esos archivos y recrea la misma imagen.
DBA: verificacion final. Este script nunca realiza las tareas de Adrian.
Uso autorizado: rotar | rotar-migrador | rotar-app (recuperacion). comprobar = solo lectura.
TXT
}
case "${1:---plan}" in
  --plan) plan; exit 0 ;;
  rotar) roles=(tramites_migrador tramites_app) ;;
  rotar-migrador) roles=(tramites_migrador) ;;
  rotar-app) roles=(tramites_app) ;;
  comprobar) roles=() ;;
  *) echo 'ERROR: argumento no permitido; no se hizo nada' >&2; exit 2 ;;
esac
[[ $# -eq 1 ]] || { echo 'ERROR: un solo argumento' >&2; exit 2; }
[[ $EUID -eq 0 ]] || { echo 'ERROR: requiere autorizacion y sudo interactivo' >&2; exit 1; }
for cmd in psql python3 runuser flock env stat; do command -v "$cmd" >/dev/null || exit 1; done

variable() { case $1 in tramites_migrador) echo FLYWAY_PASSWORD ;; tramites_app) echo DB_PASSWORD ;; esac; }

directorio_seguro() {
  [[ -d $sec && ! -L $sec && -O $sec && $(stat -c %a -- "$sec") == 700 ]] \
    || { echo "ERROR: $sec ausente o con permisos distintos de root 700" >&2; return 1; }
}

# Conexion nueva por TCP con TLS obligatorio. La clave llega a libpq por un pgpass temporal del
# mismo directorio; psql nunca la recibe por argumentos ni por el entorno.
comprobar_rol() {
  local rol=$1 esperado resultado
  python3 -I - "$sec/$(variable "$rol")" "$sec/pgpass" "$rol" <<'PY'
import os, sys
origen, destino, rol = sys.argv[1:4]
with open(origen) as f:
    clave = f.read().strip()
assert len(clave) == 64 and all(c in '0123456789abcdef' for c in clave), 'clave con formato inesperado'
with os.fdopen(os.open(destino, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), 'w') as f:
    f.write(f'127.0.0.1:5432:tramites_pruebas:{rol}:{clave}\n')
PY
  esperado="$rol|tramites_pruebas|t|f"
  [[ $rol != tramites_migrador ]] || esperado="$rol|tramites_pruebas|t|t"
  resultado="$(env -u PGPASSWORD -u PGSERVICE -u PGSERVICEFILE -u PGHOSTADDR \
    PGPASSFILE="$sec/pgpass" PGCONNECT_TIMEOUT=8 PGOPTIONS=-cdefault_transaction_read_only=on PGAPPNAME=novagest-dba-rotacion \
    psql -X -w -qAt -v ON_ERROR_STOP=1 \
      -d "host=127.0.0.1 port=5432 dbname=tramites_pruebas user=$rol sslmode=require gssencmode=disable" \
      -c "SELECT current_user,current_database(),(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),pg_has_role(current_user,'tramites_owner','SET')")" \
    || resultado=''
  rm -f -- "$sec/pgpass"
  [[ $resultado == "$esperado" ]] || { echo "ERROR: $rol no autentica con su clave vigente, sin TLS o con SET ROLE inesperado" >&2; return 1; }
  printf 'OK: %s autentica con la clave de %s/%s en una conexion nueva TLS; SET ROLE esperado.\n' "$rol" "$sec" "$(variable "$rol")"
}

comprobar_ambos() {
  directorio_seguro
  for rol in tramites_migrador tramites_app; do
    [[ -s $sec/$(variable "$rol") ]] || { echo "ERROR: falta $sec/$(variable "$rol"); NO entregar a Adrian" >&2; return 1; }
    comprobar_rol "$rol"
  done
}

trap 'rm -f -- "$sec/pgpass"' EXIT
if [[ $1 == comprobar ]]; then
  comprobar_ambos
  echo 'OK: ambas claves de la ventana estan establecidas en PostgreSQL. No se modifico nada.'
  exit 0
fi

{ exec 3<>/dev/tty; } 2>/dev/null || { echo 'ERROR: requiere TTY' >&2; exit 1; }
lock=/opt/tramites/staging/.lock
[[ -f $lock && ! -L $lock ]] || { echo 'ERROR: candado de staging ausente/no regular' >&2; exit 1; }
if [[ $1 == rotar ]]; then
  [[ ! -e $sec ]] || { echo "ERROR: $sec ya existe (ventana anterior); revisar y usar rotar-migrador/rotar-app" >&2; exit 1; }
else
  directorio_seguro
fi
printf '%s\n' 'Confirma autorizacion, Deploy pausado/sin jobs, sesion conjunta y Adrian esperando.' >&3
printf '%s' 'Escribe ROTAR SOLO STAGING para continuar: ' >&3
IFS= read -r ack <&3
[[ $ack == 'ROTAR SOLO STAGING' ]] || exit 2
exec 9<>"$lock"
flock -n 9 || { echo 'ERROR: otro operador tiene el candado; no se roto nada' >&2; exit 1; }
[[ $1 != rotar ]] || mkdir -m 700 -- "$sec"
directorio_seguro
rotados=''
trap 'rc=$?; rm -f -- "$sec/pgpass"; if (( rc != 0 )); then printf "DETENIDO. Roles cuyo cambio se inicio: %s. Claves vigentes en %s (solo root). Mantener pausa, NO entregar a Adrian; recuperar con rotar-migrador/rotar-app.\n" "${rotados:-ninguno}" "$sec" >&2; fi' EXIT

PSQL=(runuser -u postgres -- env -u PGPASSWORD -u PGSERVICE -u PGSERVICEFILE -u PGHOSTADDR PGPASSFILE=/dev/null
  psql -X -q -v ON_ERROR_STOP=1 -h /var/run/postgresql -p 5432 -U postgres -d tramites_pruebas)
for rol in "${roles[@]}"; do
  var=$(variable "$rol")
  rm -f -- "$sec/$var.nuevo"
  rotados+="$rol "
  # La clave solo se escribe en $var.nuevo; a psql llega el verificador SCRAM (RFC 7677, 4096 iteraciones,
  # el valor por defecto de PostgreSQL) y la sesion desactiva el registro de sentencias.
  python3 -I - "$rol" "$sec/$var.nuevo" <<'PY' | "${PSQL[@]}"
import base64, hashlib, hmac, os, secrets, sys
rol, destino = sys.argv[1:3]
clave = secrets.token_hex(32)
sal, n = os.urandom(16), 4096
k = hashlib.pbkdf2_hmac('sha256', clave.encode(), sal, n)
b64 = lambda x: base64.b64encode(x).decode()
almacenada = hashlib.sha256(hmac.digest(k, b'Client Key', 'sha256')).digest()
servidor = hmac.digest(k, b'Server Key', 'sha256')
with os.fdopen(os.open(destino, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as f:
    f.write(clave + '\n')
print('BEGIN;\nSET LOCAL log_statement = none;\nSET LOCAL log_min_duration_statement = -1;')
print(f"ALTER ROLE {rol} PASSWORD 'SCRAM-SHA-256${n}:{b64(sal)}${b64(almacenada)}:{b64(servidor)}';\nCOMMIT;")
PY
  mv -f -- "$sec/$var.nuevo" "$sec/$var"
  comprobar_rol "$rol"
done
comprobar_ambos
flock -u 9
exec 9>&-
printf '%s\n' 'DBA_LISTO: ambas claves vigentes y verificadas con conexiones nuevas TLS.'
printf 'ENTREGA: Adrian toma FLYWAY_PASSWORD y DB_PASSWORD de %s sin mostrarlas y recrea una vez. Ningun script nuestro reinicia.\n' "$sec"
printf '%s\n' 'Deploy sigue pausado. No retirar el directorio de claves hasta la verificacion final.'
