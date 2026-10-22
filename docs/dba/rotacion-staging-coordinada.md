# Rotación coordinada de staging — preparada, sin ejecutar

Sustituye el procedimiento anterior `novagest-rotar.sh`: ese script incluye otros entornos, edita archivos y ofrece reiniciar; **no debe utilizarse para esta ventana**.

## Contrato acordado

Una sola ventana, orden **tramites_migrador → tramites_app**, dos claves únicas nuevas, una sola recreación por Adrián. DBA cambia PostgreSQL y prueba autenticación; Adrián actualiza FLYWAY_PASSWORD/DB_PASSWORD en staging/.env y recrea el contenedor; DBA verifica después. Ningún script DBA modifica archivos de entorno ni reinicia.

El usuario eligió **sesión conjunta con entrada directa en las terminales**. El custodio introduce cada valor en los prompts ocultos de psql y luego en la sesión privada de Adrián; los valores no pasan por GitHub, chat, capturas, argumentos de comandos ni un archivo de intercambio. No compartir pantalla ni registrar la TTY durante la entrada. Adrián administra su edición privada del .env; nuestro script no la hace. Si el custodio no puede operar ambas terminales por los canales SSH ya autorizados, se detiene y se acuerda otro canal; no se improvisa una transmisión de claves.

Generar dos valores nuevos de 32+ caracteres aleatorios con una herramienta local de contraseñas; usar alfabeto A–Z/a–z/0–9/_/- para evitar interpretación del lector .env actual. El agente no genera, recibe ni conserva los valores. Adrián confirma antes de comenzar que puede introducir ambos valores y recrear inmediatamente después de DBA_LISTO.

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

La ejecución exige la frase ROTAR SOLO STAGING. Internamente usa `psql -X` y `\password` para cada rol, con SCRAM calculado por el cliente; no construye ALTER ROLE con la contraseña. Luego `psql -W`, sin PGPASSWORD heredado ni pgpass, abre una conexión nueva a tramites_pruebas con sslmode=require y verifica usuario/base/TLS y capacidad SET ROLE esperada. Los prompts no hacen eco. No activar ECHO_HIDDEN, bash -x ni captura de terminal. [Documentación de psql](https://www.postgresql.org/docs/18/app-psql.html).

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
cp -p -- .env "$rot_snapshot/env-antes"    # Adrian: privado; nunca subirlo
# Adrian actualiza FLYWAY_PASSWORD y DB_PASSWORD en su editor/herramienta privada.
# No mostrar los valores en pantalla compartida ni usar echo/sed con claves en argumentos.
# No avanzar hasta haber guardado ambas variables; conservar las otras lineas.
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

El JSON de `config` solo transita por memoria hacia el filtro: no imprimirlo, usar tee ni guardarlo en logs. El bloque contiene una pausa humana para editar, no un editor automático. Cualquier discrepancia de imagen/topología detiene la entrega y se investiga. No ejecutar down, pull, build, eliminación de volúmenes, red externa de #84 ni un segundo reinicio como intento automático. [Docker restart](https://docs.docker.com/reference/cli/docker/compose/restart/), [Docker up](https://docs.docker.com/reference/cli/docker/compose/up/).

## Recuperación

- Fallo antes de cambiar un rol: no continuar; PostgreSQL permanece con su estado previo para ese rol.
- Fallo entre roles o autenticación no confirmada: mantener Deploy pausado; Adrián no edita/recrea. Tratar el rol como potencialmente cambiado y volver a fijarlo con una clave NUEVA mediante `rotar-migrador` o `rotar-app` en la misma copia verificada. Estos modos son solo recuperación, con autorización; la ejecución normal siempre rota ambos en orden.
- No recuperar la contraseña expuesta. No restaurar hashes antiguos ni repetir automáticamente la rotación. Reanudar solo cuando ambos roles autentiquen y el custodio pueda introducir los valores vigentes en la sesión de Adrián.
- Si .env quedó incorrecto: Adrián corrige exclusivamente las dos variables con los valores vigentes. Su respaldo sirve para otras líneas, no para volver a las claves comprometidas.
- Si la recreación no queda sana: preservar imagen/topología/volúmenes; revisar localmente credenciales y configuración efectiva. DBA puede ayudar con conexiones de solo lectura. No cambiar imagen ni datos como recuperación automática. Una segunda recreación o cambio de clave requiere decisión explícita del equipo.
- Las contraseñas no se respaldan en nuestros scripts. Su recuperación es fijar otra clave nueva con el custodio, preservando la coordinación.

## Verificación final

Solo después de ADRIAN_LISTO y con autorización para sudo, ejecutar el [protocolo final](verificacion-final-staging.md). Conservar evidencias sin secretos, dejar Deploy pausado y solicitar revisión del dictamen. El éxito técnico no autoriza producción.
