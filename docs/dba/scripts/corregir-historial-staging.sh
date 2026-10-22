#!/usr/bin/env bash
# Preparado. Por defecto solo plan. No ejecutar --aplicar sin autorizacion.
set -euo pipefail
umask 077
if [[ ${1:---plan} == --plan && $# -le 1 ]]; then
  echo 'Plan: candado staging, respaldo privado historial, evidencia de negocio, REVOKE de una tabla, guardia y comparacion. Requiere autorizacion para --aplicar.'
  exit 0
fi
[[ $# -eq 1 && $1 == --aplicar ]] || exit 2
[[ $EUID -eq 0 ]] || { echo 'ERROR: requiere sudo autorizado' >&2; exit 1; }
dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
for f in revocar-historial-staging.sql guardia-historial-staging.sql estado-negocio-staging.sql; do
  [[ -f $dir/$f ]] || exit 1
done
[[ -f /opt/tramites/staging/.lock && ! -L /opt/tramites/staging/.lock ]] || exit 1
exec 9<>/opt/tramites/staging/.lock
flock -n 9 || { echo 'ERROR: hay otra operacion; no se modifico PostgreSQL' >&2; exit 1; }
backup="$(mktemp -d /root/novagest-acl.XXXXXXXX)"
trap 'rc=$?; if (( rc != 0 )); then echo "DETENIDO: conservar pausa, revisar estado y respaldo $backup; no hay recuperacion automatica tras COMMIT" >&2; fi' EXIT
ROOTPG=(runuser -u postgres -- env -u PGPASSWORD -u PGDATABASE -u PGSERVICE -u PGSERVICEFILE -u PGHOSTADDR -u PGOPTIONS PGPASSFILE=/dev/null)
PSQL=("${ROOTPG[@]}" psql -X -q -v ON_ERROR_STOP=1 -P pager=off -h /var/run/postgresql -p 5432 -U postgres -d tramites_pruebas)
"${PSQL[@]}" -Atc "SELECT current_database(),c.relname,pg_get_userbyid(c.relowner),c.relacl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='tramites' AND c.relname='flyway_schema_history'" >"$backup/acl-antes.txt"
# pg_dump/pg_restore reciben archivos mediante stdin/stdout de root: postgres no entra a /root.
"${ROOTPG[@]}" pg_dump -Fc -h /var/run/postgresql -p 5432 -U postgres -d tramites_pruebas -t tramites.flyway_schema_history >"$backup/historial.dump"
[[ -s $backup/historial.dump ]] || exit 1
"${ROOTPG[@]}" pg_restore --list <"$backup/historial.dump" >"$backup/indice-respaldo.txt"
# Sin --dbname: lee tambien los bloques de datos y genera SQL descartado, sin conexion/restauracion.
"${ROOTPG[@]}" pg_restore --file=/dev/null <"$backup/historial.dump" 2>"$backup/lectura-respaldo.txt"
"${PSQL[@]}" -Atc "SELECT installed_rank,version,script,checksum,success,installed_by,installed_on,execution_time FROM tramites.flyway_schema_history ORDER BY installed_rank" >"$backup/historial-antes.txt"
"${PSQL[@]}" <"$dir/estado-negocio-staging.sql" >"$backup/negocio-antes.txt"
(
  cd -- "$backup"
  sha256sum historial.dump indice-respaldo.txt lectura-respaldo.txt acl-antes.txt historial-antes.txt negocio-antes.txt >SHA256SUMS-antes
  sha256sum -c SHA256SUMS-antes
)
# Unico cambio PostgreSQL del script: el REVOKE en ese archivo.
"${PSQL[@]}" <"$dir/revocar-historial-staging.sql"
"${PSQL[@]}" <"$dir/guardia-historial-staging.sql" 2>&1 | tee "$backup/guardia-despues.txt"
"${PSQL[@]}" -Atc "SELECT installed_rank,version,script,checksum,success,installed_by,installed_on,execution_time FROM tramites.flyway_schema_history ORDER BY installed_rank" >"$backup/historial-despues.txt"
"${PSQL[@]}" <"$dir/estado-negocio-staging.sql" >"$backup/negocio-despues.txt"
cmp -s "$backup/historial-antes.txt" "$backup/historial-despues.txt" || { echo 'ERROR: historial difiere; investigar' >&2; exit 1; }
cmp -s "$backup/negocio-antes.txt" "$backup/negocio-despues.txt" || { echo 'ERROR: conteos o permisos de negocio difieren; investigar actividad concurrente' >&2; exit 1; }
(
  cd -- "$backup"
  sha256sum -c SHA256SUMS-antes
  sha256sum guardia-despues.txt historial-despues.txt negocio-despues.txt >SHA256SUMS-despues
  sha256sum -c SHA256SUMS-despues
)
echo "OK: permisos restringidos; historial, conteos y permisos de negocio conservados. Evidencia privada: $backup"
echo 'No se modificaron credenciales, archivos de entorno, redes, contenedores ni produccion.'
