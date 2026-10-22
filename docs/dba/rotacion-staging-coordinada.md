# Rotación coordinada de staging — preparada, sin ejecutar

Sustituye el procedimiento anterior `novagest-rotar.sh`: ese script incluye otros entornos, edita archivos y ofrece reiniciar; **no debe utilizarse para esta ventana**.

## Contrato acordado

Una sola ventana, orden **tramites_migrador → tramites_app**, dos claves únicas nuevas, una sola recreación por Adrián. DBA cambia PostgreSQL y prueba autenticación; Adrián actualiza FLYWAY_PASSWORD/DB_PASSWORD en staging/.env y recrea el contenedor; DBA verifica después. Ningún script DBA modifica archivos de entorno ni reinicia.

**Las claves nacen y se consumen en daniel1; nadie las ve ni las transmite** (sustituye la entrada manual del custodio en dos terminales, que no garantizaba entregar a Adrián exactamente los valores fijados):

- `rotar-staging-coordinado.sh` genera cada clave en el servidor (`secrets.token_hex(32)`: 256 bits, 64 caracteres hex, seguros para Compose y para el lector `envval` de tramites-ctl) y la escribe solo en `/run/novagest-rotacion-staging/FLYWAY_PASSWORD` o `DB_PASSWORD` (tmpfs en RAM, directorio root 700, archivos 600).
- PostgreSQL recibe el **verificador SCRAM** calculado en el servidor, nunca la clave; la sesión desactiva `log_statement` y `log_min_duration_statement`. La autenticación nueva con TLS lee la clave del archivo mediante un pgpass temporal del mismo directorio.
- Adrián, como root en daniel1, carga las dos variables en `.env` **desde esos mismos archivos** con el bloque de abajo, que no las muestra y comprueba que el resto del archivo no cambia. No hay canal de transmisión que proteger: ni chat, ni gestor, ni copia cifrada, ni portapapeles.
- `verificar-staging-final.sh` compara en memoria las variables del contenedor recreado con esos archivos y vuelve a autenticar ambos roles con ellos: así se acredita que lo configurado es exactamente lo establecido.
- Tras la verificación final se retira el directorio; `.env` queda como única copia. Si el servidor se reinicia antes, el tmpfs desaparece: se vuelve a rotar (no se recuperan claves).

El agente no ve, recibe ni conserva los valores. Adrián confirma antes de comenzar que estará como root en daniel1 y puede cargar y recrear inmediatamente después de DBA_LISTO: desde ese momento las conexiones nuevas del pool con la clave anterior fallan (Hikari renueva cada conexión a los 30 min).

## Ventana propuesta

Duración reservada: 30 minutos, inicio **por confirmar entre usuario, DBA y Adrián**. No se creó evento ni se anunció una hora como acordada.

| Fase | Responsable | Condición de paso |
| --- | --- | --- |
| Antes | Todos | Autorización explícita, sesión conjunta disponible, sin cambios de código/imagen/red ni actividad de escritura de usuarios de prueba. |
| 0–5 min | DBA/Adrián | Deploy sigue disabled_manually y sin runs queued/in_progress/waiting; instantánea de imagen/red/montajes y respaldo privado. Corrección ACL requiere su autorización separada. |
| 5–12 min | DBA | Script fijo: migrador y autenticación TLS; app y autenticación TLS. Nada de edición/reinicio entre los dos roles. |
| Entrega | DBA → Adrián | Solo después de DBA_LISTO y liberación de candado; si falla algún rol, mantener pausa y recuperar primero. |
| 12–20 min | Adrián | Ambas variables actualizadas, una sola recreación con la imagen comprobada, sin pull/build/down ni redes nuevas. |
| 20–30 min | DBA | Auditoría final autorizada, conciliación de evidencia y dictamen para revisión. Deploy continúa pausado. |

Los tiempos son una reserva orientativa, no un motivo para saltar comprobaciones.

## Comprobaciones previas exactas

1. Reconsultar el workflow Deploy y todos sus runs activos, incluidos waiting/queued/in_progress; pausarlo no cancela ejecuciones ya iniciadas. Confirmar con Adrián que no existe operación manual en curso ni esperando el candado.
2. Capturar desde el servidor, con la autorización necesaria, current_tag, .Config.Image y **.Image (ID sha256 real)** del contenedor de staging, NetworkID y volúmenes. Guardar fuera de Git, sin docker inspect completo, contraseñas ni archivos .env.
3. Conservar SET ROLE, currentSchema=tramites y Compose actual. Adrián confirma que retiró las variables Flyway duplicadas de app.env; Compose continúa suministrándolas desde .env. No modificar esa limpieza desde nuestros scripts.
4. Confirmar ausencia de nuevas migraciones en la imagen que se va a conservar y disponibilidad de psql/pg_dump/pg_restore. La auditoría existente y su evidencia ya están terminadas; no recrear bases ni repetirla ahora.
5. Cada fase usa el mismo candado existente `/opt/tramites/staging/.lock`. Los helpers DBA lo toman por sí mismos: no envolverlos en otro flock del mismo archivo. Los candados son cooperativos; todos deben respetar el relevo y la pausa de despliegues.

## Cambio PostgreSQL — solo después de autorización

Preparar las copias de root verificadas como indica [plan de cierre](plan-cierre-staging.md). En esa carpeta:

```bash
# Vista previa no privilegiada; solo imprime el plan:
bash rotar-staging-coordinado.sh --plan
# SOLO tras autorización, desde la copia verificada de root y con TTY:
bash rotar-staging-coordinado.sh rotar
```

La ejecución exige la frase ROTAR SOLO STAGING y que `/run/novagest-rotacion-staging` no exista. Para cada rol, en orden migrador → app: genera la clave, aplica `ALTER ROLE … PASSWORD 'SCRAM-SHA-256$4096:…'` por stdin de psql y abre una conexión nueva a tramites_pruebas con sslmode=require que verifica usuario, base, TLS y la capacidad SET ROLE esperada. Al final verifica otra vez ambos roles y solo entonces imprime DBA_LISTO. `bash rotar-staging-coordinado.sh comprobar` repite esa verificación sin cambiar nada. No activar bash -x ni captura de terminal.

La conexión de prueba sale por loopback y verifica credencial/TLS; la ruta desde el contenedor se comprobará tras recrearlo. Las sesiones del pool ya abiertas pueden seguir vivas durante el intervalo y health UP no basta para demostrar que las claves nuevas funcionan. No se terminan sesiones desde nuestro script.

## Entrega y recreación única — exclusivamente Adrián

No usar docker restart: no incorpora las variables cambiadas. El `tramites-ctl deploy` del repositorio hace `compose pull` incondicional; invocarlo sin más no garantiza conservar el mismo ID si una etiqueta se movió. Adrián debe revisar este paso controlado que usa **su Compose existente**, sin modificar tramites-ctl ni instalar otro procedimiento.

Bloque para la terminal administrativa de Adrián, **no ejecutado por nosotros** y sujeto a la autorización de reinicio. La captura de rot_ref/rot_image y topología debe hacerse también antes del cambio de claves, para conservar una línea base de toda la ventana.

```bash
set -euo pipefail
umask 077
cd /opt/tramites/staging
[[ -f .lock && ! -L .lock ]]
exec 9<>.lock
flock -n 9                           # DBA ya libero su fase
rot_cid=novagest-staging-app-1
read -r rot_tag < current_tag
[[ $rot_tag =~ ^[0-9a-f]{7,64}$ ]]
rot_ref=$(docker inspect -f '{{.Config.Image}}' "$rot_cid")
rot_image=$(docker inspect -f '{{.Image}}' "$rot_cid")
: "${NOVAGEST_IMAGE_ID_PREVIO:?Adrian debe introducir el ID sha256 registrado antes de cambiar claves}"
[[ $NOVAGEST_IMAGE_ID_PREVIO =~ ^sha256:[0-9a-f]{64}$ ]]
[[ $rot_image == "$NOVAGEST_IMAGE_ID_PREVIO" ]]
rot_snapshot=$(mktemp -d /root/novagest-recreacion.XXXXXXXX)
printf '%s\n' "$rot_image" >"$rot_snapshot/image-id.txt"
docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{println $k $v.NetworkID}}{{end}}{{range .Mounts}}{{println .Type .Name .Source .Destination}}{{end}}' "$rot_cid" | sort >"$rot_snapshot/topologia-antes.txt"
docker network inspect novagest-staging_default >/dev/null
# --- carga de claves: solo despues de DBA_LISTO. Sin copia de .env: solo una huella de las demas lineas.
rot_sec=/run/novagest-rotacion-staging
[[ -d $rot_sec && ! -L $rot_sec && -O $rot_sec && $(stat -c %a -- "$rot_sec") == 700 && -s $rot_sec/FLYWAY_PASSWORD && -s $rot_sec/DB_PASSWORD ]]
[[ $(grep -c '^FLYWAY_PASSWORD=' .env) == 1 && $(grep -c '^DB_PASSWORD=' .env) == 1 ]]
[[ $(grep -cE '^(FLYWAY_PASSWORD|DB_PASSWORD|SPRING_FLYWAY_PASSWORD|SPRING_DATASOURCE_PASSWORD)=' app.env) == 0 ]]
grep -Ev '^(FLYWAY_PASSWORD|DB_PASSWORD)=' .env | sha256sum >"$rot_snapshot/resto-env-antes.sha256"
rot_env=$(mktemp /opt/tramites/staging/.env.rotacion.XXXXXXXX)
awk -v d="$rot_sec" '
  BEGIN { if ((getline f < (d "/FLYWAY_PASSWORD")) <= 0 || (getline a < (d "/DB_PASSWORD")) <= 0) { err = 1; exit } }
  /^FLYWAY_PASSWORD=/ { print "FLYWAY_PASSWORD=" f; nf++; next }
  /^DB_PASSWORD=/ { print "DB_PASSWORD=" a; na++; next }
  { print }
  END { if (err) exit 4; if (nf != 1 || na != 1) exit 3 }' .env >"$rot_env"
grep -Ev '^(FLYWAY_PASSWORD|DB_PASSWORD)=' "$rot_env" | sha256sum | cmp - "$rot_snapshot/resto-env-antes.sha256"
chown --reference=.env -- "$rot_env"
chmod --reference=.env -- "$rot_env"
mv -f -- "$rot_env" .env
# --- fin de la carga; .env ya tiene las claves vigentes. Recrear sin pausa:
rot_compose=(docker compose --project-directory /opt/tramites/staging -f /opt/tramites/staging/compose.yaml --env-file /opt/tramites/staging/.env)
[[ $(docker image inspect -f '{{.Id}}' "$rot_ref") == "$rot_image" ]]
APP_TAG="$rot_tag" "${rot_compose[@]}" config --format json | python3 -c 'import json,sys; c=json.load(sys.stdin); assert c["services"]["app"]["image"]==sys.argv[1]' "$rot_ref"
APP_TAG="$rot_tag" "${rot_compose[@]}" up -d --no-deps --no-build --pull never --force-recreate app
[[ $(docker inspect -f '{{.Image}}' "$rot_cid") == "$rot_image" ]]
docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{println $k $v.NetworkID}}{{end}}{{range .Mounts}}{{println .Type .Name .Source .Destination}}{{end}}' "$rot_cid" | sort >"$rot_snapshot/topologia-despues.txt"
cmp "$rot_snapshot/topologia-antes.txt" "$rot_snapshot/topologia-despues.txt"
flock -u 9
exec 9>&-
# Conservar snapshot privado y comunicar ADRIAN_LISTO sin valores de contrasenas.
```

El JSON de `config` solo transita por memoria hacia el filtro: no imprimirlo, usar tee ni guardarlo en logs. La carga escribe un `.env` nuevo en el mismo directorio (mismo dueño y modo) y lo sustituye de forma atómica; si algo falla antes del `mv`, `.env` queda intacto y se borra el temporal `.env.rotacion.*` sin mirarlo. No usar nano/sed/echo con los valores: mostrarían o expondrían las claves. Cualquier discrepancia de imagen/topología detiene la entrega y se investiga. No ejecutar down, pull, build, eliminación de volúmenes, red externa de #84 ni un segundo reinicio como intento automático. [Docker restart](https://docs.docker.com/reference/cli/docker/compose/restart/), [Docker up](https://docs.docker.com/reference/cli/docker/compose/up/).

## Recuperación

- Fallo antes de cambiar un rol: no continuar; PostgreSQL permanece con su estado previo para ese rol.
- Fallo entre roles o autenticación no confirmada: mantener Deploy pausado; Adrián no carga ni recrea. Volver a fijar el rol afectado con una clave NUEVA mediante `rotar-migrador` o `rotar-app` en la misma copia verificada (reutilizan el directorio de claves). Estos modos son solo recuperación, con autorización; la ejecución normal siempre rota ambos en orden.
- Cualquier modo termina verificando los dos roles con los archivos vigentes; solo entonces emite DBA_LISTO.
- No recuperar la contraseña expuesta. No restaurar hashes antiguos ni repetir automáticamente la rotación.
- Si .env quedó incorrecto: Adrián repite la carga desde el mismo directorio (fuente única de las claves vigentes). No hay copia de .env con las claves comprometidas que restaurar, a propósito.
- Si la recreación no queda sana: preservar imagen/topología/volúmenes; revisar localmente credenciales y configuración efectiva. DBA puede ayudar con conexiones de solo lectura. No cambiar imagen ni datos como recuperación automática. Una segunda recreación o cambio de clave requiere decisión explícita del equipo.
- Las contraseñas no se respaldan fuera del directorio tmpfs de la ventana. Perder ese directorio antes de la carga de Adrián se resuelve fijando otras claves nuevas.

## Verificación final

Solo después de ADRIAN_LISTO y con autorización para sudo, ejecutar el [protocolo final](verificacion-final-staging.md). Conservar evidencias sin secretos, dejar Deploy pausado y solicitar revisión del dictamen. El éxito técnico no autoriza producción.

Cuando la verificación final termina en OK, retirar las claves temporales (como root): `rm -f -- /run/novagest-rotacion-staging/{FLYWAY_PASSWORD,DB_PASSWORD} && rmdir /run/novagest-rotacion-staging`.
