#!/usr/bin/env bash
# PREPARADO, NO EJECUTADO. Solo cambia contrasenas de los dos roles de staging.
# Nunca lee/escribe .env/app.env, ni llama Docker, tramites-ctl o servicios.
# Sin secretos en argumentos, variables del script, archivos o reportes.
set +x
set -euo pipefail
umask 077

plan() {
  cat <<'TXT'
Plan: Deploy pausado y sin jobs activos; ventana y sesion conjunta confirmadas.
DBA: candado existente de staging, \password migrador, conexion nueva TLS;
despues \password app, conexion nueva TLS; libera candado y entrega a Adrian.
Adrian: actualiza solo FLYWAY_PASSWORD y DB_PASSWORD y recrea la misma imagen.
DBA: verificacion final. Este script nunca realiza las tareas de Adrian.
Uso autorizado: rotar | rotar-migrador | rotar-app. Por defecto solo muestra plan.
TXT
}
case "${1:---plan}" in
  --plan) plan; exit 0 ;;
  rotar) roles=(tramites_migrador tramites_app) ;;
  rotar-migrador) roles=(tramites_migrador) ;;
  rotar-app) roles=(tramites_app) ;;
  *) echo 'ERROR: argumento no permitido; no se hizo nada' >&2; exit 2 ;;
esac
[[ $# -eq 1 ]] || { echo 'ERROR: un solo argumento' >&2; exit 2; }
[[ $EUID -eq 0 ]] || { echo 'ERROR: requiere autorizacion y sudo interactivo' >&2; exit 1; }
{ exec 3<>/dev/tty; } 2>/dev/null || { echo 'ERROR: requiere TTY' >&2; exit 1; }
for cmd in psql runuser flock env; do command -v "$cmd" >/dev/null || exit 1; done
lock=/opt/tramites/staging/.lock
[[ -f $lock && ! -L $lock ]] || { echo 'ERROR: candado de staging ausente/no regular' >&2; exit 1; }
printf '%s\n' 'Confirma autorizacion, Deploy pausado/sin jobs, sesion conjunta y Adrian esperando.' >&3
printf '%s' 'Escribe ROTAR SOLO STAGING para continuar: ' >&3
IFS= read -r ack <&3
[[ $ack == 'ROTAR SOLO STAGING' ]] || exit 2
exec 9<>"$lock"
flock -n 9 || { echo 'ERROR: otro operador tiene el candado; no se roto nada' >&2; exit 1; }
rotados=''
trap 'rc=$?; if (( rc != 0 )); then printf "DETENIDO. Roles cuyo cambio se inicio: %s. Mantener pausa; recuperar hacia una clave nueva, sin restaurar la expuesta.\n" "${rotados:-ninguno}" >&2; fi' EXIT

for rol in "${roles[@]}"; do
  printf '\nRol: %s. El custodio introduce una clave NUEVA de 32+ caracteres, dos veces.\n' "$rol" >&3
  # psql calcula el verificador en cliente. No habilitar ECHO_HIDDEN, tracing o captura de TTY.
  rotados+="$rol "
  runuser -u postgres -- env -u PGPASSWORD -u PGSERVICE -u PGSERVICEFILE -u PGHOSTADDR \
    PGPASSFILE=/dev/null PGOPTIONS=-cpassword_encryption=scram-sha-256 \
    psql -X -q -v ON_ERROR_STOP=1 -h /var/run/postgresql -p 5432 -U postgres -d tramites_pruebas -c "\\password $rol" \
    </dev/tty >/dev/tty 2>&1
  printf '%s\n' 'Introduce otra vez la clave NUEVA para una conexion independiente TLS; no se guarda.' >&3
  expected="$rol|tramites_pruebas|t|f"
  [[ $rol != tramites_migrador ]] || expected="$rol|tramites_pruebas|t|t"
  result="$(env -u PGPASSWORD -u PGSERVICE -u PGSERVICEFILE -u PGHOSTADDR \
    PGPASSFILE=/dev/null PGCONNECT_TIMEOUT=8 PGOPTIONS=-cdefault_transaction_read_only=on PGAPPNAME=novagest-dba-rotacion \
    psql -X -W -qAt -v ON_ERROR_STOP=1 \
      -d "host=127.0.0.1 port=5432 dbname=tramites_pruebas user=$rol sslmode=require gssencmode=disable" \
      -c "SELECT current_user,current_database(),(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),pg_has_role(current_user,'tramites_owner','SET')" \
      </dev/tty 2>/dev/tty)"
  [[ $result == "$expected" ]] || { echo "ERROR: verificacion de $rol no coincide; detener entrega" >&2; exit 1; }
  printf 'OK: %s autentica en tramites_pruebas con TLS; permisos de SET ROLE esperados.\n' "$rol"
done
flock -u 9
exec 9>&-
printf '%s\n' 'DBA_LISTO: claves de roles indicados cambiadas y conexiones verificadas.'
printf '%s\n' 'ENTREGA: Adrian actualiza .env y recrea la misma imagen. Ningun script nuestro reinicia.'
printf '%s\n' 'Deploy sigue pausado. No ejecutar otra fase DBA mientras Adrian trabaja.'
