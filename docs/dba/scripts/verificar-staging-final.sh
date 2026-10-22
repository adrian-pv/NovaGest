#!/usr/bin/env bash
# Solo lectura de staging. Ejecucion privilegiada e ingreso interactivo requieren autorizacion.
set +x
set -euo pipefail
if [[ ${1:---plan} == --plan && $# -le 1 ]]; then
  echo 'Plan: imagen esperada, health, configuracion no secreta, autenticacion nueva TLS de ambos roles, guardia ACL y auditoria SQL staging. No modifica ni reinicia.'
  exit 0
fi
[[ $# -eq 2 && $1 == --verificar && $2 =~ ^sha256:[0-9a-f]{64}$ ]] || exit 2
[[ $EUID -eq 0 ]] || exit 1
expected=$2
dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
[[ -f $dir/guardia-historial-staging.sql && -f $dir/auditoria-staging.sql ]] || exit 1
[[ -f /opt/tramites/staging/.lock && ! -L /opt/tramites/staging/.lock ]] || exit 1
exec 9<>/opt/tramites/staging/.lock
flock -n 9 || { echo 'ERROR: Adrian u otra operacion aun usa el candado' >&2; exit 1; }
{ exec 3<>/dev/tty; } 2>/dev/null || exit 1
cid=novagest-staging-app-1
[[ $(docker inspect -f '{{.Image}}' "$cid") == "$expected" ]] || { echo 'ERROR: imagen distinta' >&2; exit 1; }
[[ $(docker inspect -f '{{.State.Status}}' "$cid") == running ]] || exit 1
curl -fsS --max-time 10 http://127.0.0.1:8081/actuator/health | python3 -c \
  'import json,sys; assert json.load(sys.stdin).get("status")=="UP"; print("OK: health UP")'
# JSON de entorno solo en memoria; nunca se imprime ni se guarda. No se imprime la URL JDBC.
docker inspect -f '{{json .Config.Env}}' "$cid" | python3 -c '
import json,sys,urllib.parse
e=dict(x.split("=",1) for x in json.load(sys.stdin) if "=" in x)
assert e.get("SPRING_FLYWAY_USER")=="tramites_migrador"
assert e.get("DB_USER")=="tramites_app"
assert e.get("SPRING_DATASOURCE_USERNAME","tramites_app")=="tramites_app"
assert e.get("SPRING_FLYWAY_INIT_SQLS","").strip().rstrip(";").lower()=="set role tramites_owner"
assert not any(k.startswith("SPRING_FLYWAY_INIT_SQLS_") for k in e)
assert e.get("SPRING_FLYWAY_PASSWORD") and e.get("DB_PASSWORD")
if "SPRING_DATASOURCE_PASSWORD" in e: assert e["SPRING_DATASOURCE_PASSWORD"]==e["DB_PASSWORD"]
url=e.get("SPRING_DATASOURCE_URL","")
assert urllib.parse.parse_qs(urllib.parse.urlsplit(url.removeprefix("jdbc:")).query).get("currentSchema")==["tramites"]
print("OK: usuarios separados, SET ROLE unico y currentSchema; secretos no mostrados")
'
for rol in tramites_migrador tramites_app; do
  printf 'Verificacion final de %s: introducir la clave NUEVA sin eco.\n' "$rol" >&3
  expected_auth="$rol|tramites_pruebas|t"
  auth="$(env -u PGPASSWORD -u PGSERVICE -u PGSERVICEFILE -u PGHOSTADDR PGPASSFILE=/dev/null \
    PGCONNECT_TIMEOUT=8 PGOPTIONS=-cdefault_transaction_read_only=on \
    psql -X -W -qAt -v ON_ERROR_STOP=1 \
    -d "host=127.0.0.1 port=5432 dbname=tramites_pruebas user=$rol sslmode=require gssencmode=disable" \
    -c 'SELECT current_user,current_database(),(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid())' \
    </dev/tty 2>/dev/tty)"
  [[ $auth == "$expected_auth" ]] || exit 1
  echo "OK: autenticacion nueva de $rol y TLS"
done
PSQL=(runuser -u postgres -- env -u PGPASSWORD -u PGSERVICE -u PGSERVICEFILE -u PGHOSTADDR PGPASSFILE=/dev/null PGOPTIONS=-cdefault_transaction_read_only=on psql -X -v ON_ERROR_STOP=1 -P pager=off -h /var/run/postgresql -p 5432 -U postgres -d tramites_pruebas)
"${PSQL[@]}" <"$dir/guardia-historial-staging.sql"
"${PSQL[@]}" <"$dir/auditoria-staging.sql"
started="$(docker inspect -f '{{.State.StartedAt}}' "$cid")"
cip="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$cid")"
[[ $cip =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || exit 1
"${PSQL[@]}" -v started="$started" -v cip="$cip" <<'SQL'
BEGIN READ ONLY;
SELECT count(*)>0 AND bool_and(coalesce(s.ssl,false))
  AND bool_and(a.backend_start >= :'started'::timestamptz) AS sesiones_nuevas_tls
FROM pg_stat_activity a LEFT JOIN pg_stat_ssl s ON s.pid=a.pid
WHERE a.datname='tramites_pruebas' AND a.usename='tramites_app' AND a.client_addr=:'cip'::inet \gset
\if :sesiones_nuevas_tls
  \echo 'OK: pool del contenedor con sesiones posteriores a la recreacion y TLS'
\else
  DO $f$BEGIN RAISE EXCEPTION 'FALLO: sesiones nuevas TLS de app no verificadas'; END$f$;
\endif
ROLLBACK;
SQL
echo 'OK: comprobaciones automaticas. Faltan conciliar snapshot de negocio, logs y conformidad operativa del equipo antes del cierre.'
