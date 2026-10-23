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

No usar `docker restart`: no incorpora las variables cambiadas. No usar `tramites-ctl deploy`: hace `compose pull` incondicional y no garantiza conservar el mismo ID si una etiqueta se movió.

Adrián usa `cargar-recrear-staging.sh`, del mismo paquete y manifest, como root y desde la copia verificada:

```bash
bash cargar-recrear-staging.sh --plan                          # vista previa, sin privilegios
sudo bash cargar-recrear-staging.sh --comprobar sha256:<ID>    # solo lectura: antes de la ventana y justo antes de DBA_LISTO
sudo bash cargar-recrear-staging.sh --aplicar sha256:<ID>      # solo tras DBA_LISTO, sin pausa
```

`<ID>` es el `.Image` del contenedor capturado antes de rotar (paso 5.1 de las órdenes). El script:

- **Respeta el candado.** Toma `/opt/tramites/staging/.lock` (el de tramites-ctl) durante toda la operación.
- **Comprueba antes de tocar nada:**
  - `.env` y `app.env` son de `deploy:deploy`, modo 600, sin enlaces;
  - `.env` termina en salto de línea y tiene una sola línea `FLYWAY_PASSWORD=` y `DB_PASSWORD=`;
  - `app.env` no tiene contraseñas de base;
  - `current_tag` y `APP_PORT` son válidos;
  - el contenedor y la etiqueta usan ese ID, y `compose config` usa esa imagen.
  - Avisa, solo con nombres, de copias `.env.*`/`app.env.*` que puedan conservar claves.
- **Carga las claves sin mostrarlas.** Lee las dos de `/run/novagest-rotacion-staging` y escribe un `.env.rotacion.*` con el mismo dueño y modo. Solo lo sustituye de forma atómica si el resto de `.env` queda idéntico (huella SHA-256). Comprueba después que `compose config` entrega exactamente esas claves a `app`. Con `set -Eeuo pipefail`, cualquier error informa la línea y retira el temporal; `.env` queda intacto. No copia el `.env` anterior.
- **Recrea una sola vez:** `compose up -d --no-deps --no-build --pull never --force-recreate app`. Exige contenedor nuevo, la misma imagen y las mismas redes y montajes.
- **Espera el health.** Hasta 180 s, a que `http://127.0.0.1:${APP_PORT}/actuator/health` devuelva JSON válido con `status` UP. Si el contenedor queda `exited` o `dead`, se detiene de inmediato.
- **Bitácora.** Si todo va bien, añade a `deploy.log` una línea con el formato de tramites-ctl (`tramites-ctl status` la muestra) y termina con `ADRIAN_LISTO`:
  `<UTC> | staging | rotacion-credenciales OK <etiqueta> (imagen sha256:… sin cambios; FLYWAY_PASSWORD y DB_PASSWORD nuevas; health UP) | <SUDO_USER>`

Códigos:

| Código | Significado | Qué hacer |
| --- | --- | --- |
| 0 | `ADRIAN_LISTO` | Avisar al DBA para la verificación final. |
| 1 | Detenido antes de recrear | Corregir la causa indicada y repetir `--aplicar`: aún no hubo recreación. Si ya se cargó `.env`, repetir es idempotente. |
| 2 | Uso incorrecto | Revisar los argumentos. |
| 5 | Detenido después de recrear | No repetir. Muestra el estado del contenedor y hasta 80 líneas de log enmascaradas (claves vigentes y valores tipo `password=`/`token:`), deja el diagnóstico en `/root/novagest-recreacion.*/diagnostico.txt` y registra `rotacion-credenciales FALLÓ` en `deploy.log`. Avisar al DBA; una segunda recreación requiere decisión explícita del equipo. |

**Pruebas:** `docs/dba/tests/probar_recreacion_staging.py` en Linux, sin privilegios, con docker y curl simulados que registran cada llamada y rechazan `pull`, `build`, `down`, `restart` y cualquier `up` distinto del indicado: 39 casos. No se usó staging. Detalle en la [validación](validacion-preparacion-cierre.md#validacion-recreacion-22-10).

## Recuperación

- Fallo antes de cambiar un rol: no continuar; PostgreSQL permanece con su estado previo para ese rol.
- Fallo entre roles o autenticación no confirmada: mantener Deploy pausado; Adrián no carga ni recrea. Volver a fijar el rol afectado con una clave NUEVA mediante `rotar-migrador` o `rotar-app` en la misma copia verificada (reutilizan el directorio de claves). Estos modos son solo recuperación, con autorización; la ejecución normal siempre rota ambos en orden.
- Cualquier modo termina verificando los dos roles con los archivos vigentes; solo entonces emite DBA_LISTO.
- No recuperar la contraseña expuesta. No restaurar hashes antiguos ni repetir automáticamente la rotación.
- Si `cargar-recrear-staging.sh --aplicar` termina con 1 (antes de recrear): corregir la causa y repetirlo; el directorio de claves es la fuente única. No hay copia de .env con las claves comprometidas que restaurar, a propósito.
- Si termina con 5 (después de recrear): preservar imagen, topología y volúmenes y revisar el diagnóstico privado. DBA puede ayudar con conexiones de solo lectura. No cambiar imagen ni datos como recuperación automática. Una segunda recreación o cambio de clave requiere decisión explícita del equipo.
- Las contraseñas no se respaldan fuera del directorio tmpfs de la ventana. Perder ese directorio antes de la carga de Adrián se resuelve fijando otras claves nuevas.

## Verificación final

Solo después de ADRIAN_LISTO y con autorización para sudo, ejecutar el [protocolo final](verificacion-final-staging.md). Conservar evidencias sin secretos, dejar Deploy pausado y solicitar revisión del dictamen. El éxito técnico no autoriza producción.

Cuando la verificación final termina en OK, retirar las claves temporales (como root): `rm -f -- /run/novagest-rotacion-staging/{FLYWAY_PASSWORD,DB_PASSWORD} && rmdir /run/novagest-rotacion-staging`. Las copias `.env.*`/`app.env.*` que avisó el script conservan claves anteriores (y `app.env.*` quizá el JWT vigente): retirarlas con autorización de Adrián, después de comprobar que no las usa ningún procedimiento.
