# Validación de la preparación

Fecha: 21/10/2026, America/Mexico_City. Este registro no acredita ejecución de los cambios preparados.

- `bash -n`: correcto en rotar-staging-coordinado.sh, corregir-historial-staging.sh y verificar-staging-final.sh.
- `--plan`: los tres imprimen su secuencia y terminan correctamente sin pedir sudo, conectarse ni cambiar nada.
- Argumento de rotación fuera de la lista: rechazado antes de cualquier acción.
- Siete archivos del paquete contrastados con SHA256SUMS; manifest SHA-256 `b1e58c1dc161b27022f65a3dc304b0eee1b6013356b6dabe8ff03b4de1d3e589` (sustituido el 21/10: ver la validación de Claude al final).
- `git diff --check`: sin errores.
- Inspección de alcance: rotación solo contiene dos roles de staging; psql administrador usa socket local/puerto/usuario/base explícitos. El script no lee archivos de entorno ni llama Docker/tramites-ctl. El único cambio persistente del script ACL es REVOKE en una tabla.
- SQL revisado estáticamente: guardia READ ONLY, EXPLAIN sin ANALYZE, conteos agregados y ROLLBACK. No se ejecutó SQL nuevo sobre el servidor para ensayar la preparación. Su validación operativa queda para la ejecución autorizada; cualquier fallo de la guardia impide cerrar.
- GitHub: #85 y #88 con cuatro checks verdes antes de ampliar esta documentación; los checks del nuevo commit se registran por separado en el PR. No se sustituyen con las 625 pruebas anteriores.
- Deploy disabled_manually y cero queued/in_progress/waiting/requested/pending al consultar a las 18:41. Health UP consultado sin sudo a las 18:30. Revalidar al inicio de la ventana.

No se ejecutaron REVOKE, \password, sudo, reinicios, nuevas migraciones, cierres de PR ni cambios de protección. No se enviaron contraseñas ni mensajes de coordinación a terceros; los textos están preparados para aprobación/revisión.

## Revisión final de preparación

Se corrigieron tres riesgos antes de ejecutar: comprobación de SET ROLE owner además de USAGE en precondición/guardia; recuperación individual sin señal DBA_LISTO; pausa interactiva explícita antes de la recreación documentada de Adrián. La propuesta SQL usa ahora una sola referencia canónica, evitando una variante manual con menos precondiciones.

Validación local ampliada: 26 comprobaciones correctas (sintaxis de tres scripts, --plan y modo sin argumentos, rechazo de argumentos inválidos, bloques Bash de documentación, siete hashes/copias privadas, V9/V10 intactas en HEAD y develop consultado, revisión acotada de patrones sensibles). Evidencia local: validacion-local-cierre.json. El control de patrones no sustituye Gitleaks ni certifica ausencia universal de secretos. No se ejecutaron SQL nuevo, cambios de clave, comandos Docker ni caminos privilegiados. El helper de validación local está fuera del PR, dentro del área exclusiva de NovaGest.

Hash del manifest en esa fecha: b1e58c1dc161b27022f65a3dc304b0eee1b6013356b6dabe8ff03b4de1d3e589. **Ya no es el vigente:** ese paquete daba OK con comprobaciones fallidas (ver abajo). Manifest vigente: `5426132bfe9256673d292e8401d32ecf4940287872e1c06b3d9d73655c9ce44e` ([rotación](#validacion-rotacion-22-10), [carga y recreación](#validacion-recreacion-22-10)).

## Ejecución principal Codex y respaldo — 22/10/2026 01:25–01:28 UTC

Se mantiene el paquete existente. Codex asume ejecución DBA/staging; Claude revisa independientemente y sus hallazgos críticos deben quedar incorporados antes de cualquier operación privilegiada. No se accedió a su carpeta. Consultados #87/#88: sin comentarios ni revisiones formales entregadas en esos canales; no se presume conformidad del auditor.

Revalidación: health UP a las 01:25:06 UTC, Deploy disabled_manually y cero queued/in_progress/waiting/requested/pending. Por SSH sin sudo se comprobó disponibilidad de psql, pg_dump, pg_restore, flock, sha256sum, runuser, python3 y curl. pg_restore informa PostgreSQL 18.6. Una entrada sintética inválida por stdin fue rechazada por pg_restore --file=/dev/null con código 1, sin --dbname ni conexión/restauración; es una prueba negativa del lector, **no la validación de un respaldo real**.

El helper de ACL añade lectura completa del dump sin conexión y hashes del respaldo/evidencias antes de REVOKE, revalidación de los originales y hashes de salidas después. No se ejecutó su camino --aplicar; el respaldo real y sus hashes aún no existen. Se repitieron las 26 comprobaciones locales sobre el paquete nuevo y resultaron correctas. Las pruebas SQL/privilegiadas y la restauración real siguen pendientes de autorización; los checks del nuevo commit se registran aparte en #88.

<a id="validacion-21-10-claude"></a>

## Validación 21/10/2026 — Claude (asume la ejecución DBA)

**Fallo crítico corregido.** Los scripts usaban `\quit 3` / `\quit 4` como código de error, pero psql ignora ese argumento ("\quit: argumento extra «3» ignorado") y sale con 0. Con `set -e`, `corregir-historial-staging.sh` seguía y anunciaba "OK: permisos restringidos" aunque el REVOKE se hubiera revertido o la guardia hubiera fallado; `verificar-staging-final.sh` podía dar por buenas sesiones sin TLS. Reproducido con los scripts de 59dec1f: con `GRANT SELECT … TO PUBLIC` o con `GRANT tramites_owner TO tramites_app`, código 0, mensaje OK y la ACL seguía con `tramites_app=arwd`.

Cambios (trabajo sin confirmar de Codex recuperado + revisión de Claude):

- Cada fallo termina con `DO … RAISE EXCEPTION` bajo `ON_ERROR_STOP`: psql sale con 3 y revierte la transacción abierta.
- revocar y guardia comprueban también privilegios por columna (`has_any_column_privilege`) y la pertenencia a `tramites_owner` (USAGE y SET).
- La guardia pasa por `tee`: el motivo del fallo queda en pantalla y `pipefail` conserva el código.
- `estado-negocio-staging.sql` etiqueta cada fila (`conteo|`, `permiso|`, `secuencia|`). `corregir-historial-staging.sh` exige historial y permisos idénticos y registra los conteos como evidencia: un alta legítima durante la ventana ya no detiene el script tras el COMMIT.
- `.gitattributes`: `*.sh`, `*.sql` y este manifest con LF (en Windows con `core.autocrlf=true` salían con CRLF: bash falla y el SHA-256 no coincide).
- `tests/probar_preparacion_postgres.py` (de Codex): arranque de `pg_ctl` sin capturar la salida (en Windows se colgaba) y casos de punta a punta de `corregir-historial-staging.sh` con su texto real.

Pruebas en un clúster PostgreSQL 18.6 **nuevo, desechable, de loopback y con TLS** (nunca staging):

| Prueba | Resultado |
| --- | --- |
| Arnés completo sobre el paquete vigente | **63 casos correctos** |
| El mismo arnés sobre los scripts de 59dec1f | Falla en el primer caso negativo: revocar en una base equivocada sale con 0 |
| Negativos de revocar (base equivocada, app con SET ROLE heredado o no, PUBLIC, migrador sin SET, dueño cambiado) | Código 3 y ACL sin cambios |
| Negativos de la guardia (INSERT/SELECT/DELETE o UPDATE de columna devueltos, checksum V9/V10, success=false, versión extra, migrador sin SET, app sin SELECT en pago) | Código 3, sin "OK: guardia" |
| `corregir` completo: normal / alta concurrente de la app | 0, OK; "conteos iguales" / "conteos cambiaron" |
| `corregir` completo: permiso de negocio cambiado | 1, sin OK |
| `corregir` completo: PUBLIC, SET ROLE, privilegio que reaparece, privilegio de columna, checksum alterado | 3, sin OK; ACL revertida cuando falla el REVOKE |
| Bloque de sesiones TLS de `verificar-staging-final.sh` | Sin sesiones, sin TLS o anteriores a la recreación: 3; sesiones nuevas con TLS: 0 |
| Lector del respaldo (`pg_restore --list` y `--file` nulo, sin conexión) | Dump real: 0; archivo inválido: 1 |
| Tubería psql/tee con `set -euo pipefail` | Error de psql o de tee: sin mensaje final |

Límites: el arnés sustituye root, runuser, flock, el socket y las rutas del servidor; no ejecuta `rotar-staging-coordinado.sh` ni nada sobre Docker, staging o producción. El ensayo real en el servidor sigue requiriendo autorización.

Manifest de esa validación: `445ae506278cca11370fab615b2ba85f91a1a2c8b5109d184e279720683ab72a` (sustituido abajo; los cinco archivos del REVOKE conservan sus hashes).

<a id="validacion-rotacion-22-10"></a>

## Validación 22/10/2026 — rotación con entrega exacta a Adrián

La entrada manual del custodio en dos terminales no garantizaba que Adrián configurara exactamente las claves fijadas. Cambios:

- `rotar-staging-coordinado.sh` genera cada clave en el servidor (256 bits, hex) en `/run/novagest-rotacion-staging` (tmpfs, root 700). PostgreSQL recibe el verificador SCRAM-SHA-256 (4096 iteraciones), nunca la clave, en una sesión con `log_statement` y `log_min_duration_statement` desactivados. Cada rol se verifica con una conexión nueva `sslmode=require` y la columna `ssl` de `pg_stat_ssl`; al final se verifican ambos. Nuevo modo `comprobar` (solo lectura).
- `verificar-staging-final.sh` compara en memoria FLYWAY/DB_PASSWORD del contenedor con esos archivos y autentica con `comprobar`; ya no pide claves por TTY.
- Procedimiento: Adrián carga las dos variables desde esos archivos con un bloque que no las muestra, exige una sola línea de cada una, ninguna clave en `app.env` y el resto de `.env` idéntico (huella SHA-256); sustitución atómica. Se eliminó la copia `env-antes` con las claves anteriores.

| Prueba (arnés, clúster nuevo con `log_statement=all` y pg_hba SCRAM con o sin TLS, como staging) | Resultado |
| --- | --- |
| Arnés completo | **85 casos correctos** (63 anteriores + 22) |
| `rotar` normal | 0, DBA_LISTO; migrador antes que app; claves de 64 hex distintas; las anteriores ya no autentican; `pg_authid` con `SCRAM-SHA-256$4096:` |
| Frase incorrecta / argumento inválido / directorio de una ventana anterior | 2 / 2 / 1, sin cambios |
| `comprobar`: app con otra clave, app con SET ROLE al dueño, migrador sin SET ROLE, servidor sin TLS, sin directorio | 1, sin OK |
| Fallo a mitad (app sin LOGIN tras su cambio) | 1, "DETENIDO…", sin DBA_LISTO; `rotar-app` recupera, conserva la clave del migrador y vuelve a verificar ambos |
| Log de PostgreSQL tras 6 claves generadas | Sin claves ni verificadores (registra el resto: la prueba es válida) |
| Salida de los scripts | Sin claves en ningún caso |
| Carga de Adrián: normal / DB_PASSWORD duplicada / sin FLYWAY_PASSWORD / clave en `app.env` | 0 con solo esas dos líneas cambiadas / 1 con `.env` intacto en los tres negativos |
| Mutantes: sin `SET LOCAL log_statement = none` / `sslmode=prefer` sin comprobar `ssl` | El arnés falla ("clave o verificador en el log" / "servidor sin TLS" con 0) |

Límite: el modo 700 del directorio solo se prueba en Linux (Git Bash con `noacl` muestra `0777 & ~umask`). No se ejecutó nada en staging.

Manifest de esa validación: `f92e5682a387910f43f39515483795c4078f12cb93b39f55184b5fed2de0a391` (sustituido abajo; sus siete archivos conservan los hashes).

<a id="validacion-recreacion-22-10"></a>

## Validación 22/10/2026 — carga y recreación de Adrián (`cargar-recrear-staging.sh`)

Adrián revisó el procedimiento y pidió tres ajustes antes de ejecutarlo:

1. Esperar el health tras recrear.
2. Un script independiente en lugar del bloque en línea.
3. Una línea en `deploy.log`.

`cargar-recrear-staging.sh` sustituye al bloque:

- **Ejecución:** `set -Eeuo pipefail`, informa la línea del fallo y retira el `.env.rotacion.*` si algo falla. Usa el candado de tramites-ctl.
- **Comprobaciones:** dueño y modo de `.env` y `app.env`, mismo ID de imagen, redes y montajes. Nunca hace pull, build, down ni una segunda recreación.
- **Health:** espera hasta 180 s un JSON válido con status UP.
- **Fallo:** diagnóstico enmascarado (estado y hasta 80 líneas de log).
- **Bitácora:** línea con el formato de tramites-ctl en `deploy.log`.

`probar_recreacion_staging.py`: Linux (daniel1, directorio temporal de un usuario sin acceso a Docker), docker y curl simulados que registran cada llamada y rechazan cualquier orden no prevista. No se usó staging ni Docker.

| Prueba | Resultado |
| --- | --- |
| Arnés completo | **39 casos correctos** |
| `--plan` / uso inválido (5 variantes) | 0 / 2, sin llamar a docker |
| `--comprobar` antes y después de las claves; ID distinto; `.env` sin salto final | 0 sin cambios, sin captura y sin recrear (avisa de las copias `.env.*`/`app.env.*` y de temporales previos) / 1 |
| `--aplicar` normal | 0: solo cambian las dos líneas, que coinciden con los archivos de claves; modo 600; una sola recreación, que ya ve las claves nuevas; health consultado; `deploy.log` conserva lo anterior y añade `… \| staging \| rotacion-credenciales OK <etiqueta> (imagen sha256:… sin cambios; …; health UP) \| <SUDO_USER>`; captura privada; `ADRIAN_LISTO` |
| Detenido antes de recrear (15 causas): sin claves, claves 644 o con formato inválido, etiqueta movida, contenedor inexistente, compose con otra imagen, DB_PASSWORD duplicada, sin FLYWAY_PASSWORD, clave en `app.env`, `.env` sin salto final, `.env` 644 / enlace simbólico / enlace duro, `deploy.log` enlace, candado ocupado | 1, `.env` intacto, sin temporales, sin recreación |
| Fallo inesperado (chown) a mitad de la carga | 1, "FALLO: linea 181", temporal retirado, `.env` intacto |
| Temporales de una carga interrumpida / `deploy.log` inexistente / health UP al tercer intento / compose no entregaría las claves | 0 retirándolos / 0 creándolo con dueño y modo de `current_tag` / 0 / 1 sin recrear |
| Tras recrear (8 causas): health DOWN, JSON truncado, no JSON, sin respuesta, contenedor exited (parada inmediata), imagen distinta, topología distinta, `compose up` con error | 5, una sola recreación, `deploy.log` con `rotacion-credenciales FALLÓ`, diagnóstico ≤ 80 líneas con las claves y los valores `password`/`token` ocultos, sin `ADRIAN_LISTO` |
| Secretos | Ninguna clave nueva ni anterior en salidas, argumentos de docker, `deploy.log` ni capturas |
| Mutantes (8) | 7 detectados: health por `grep`, sin limpieza, sin enmascarado, sin `--pull never`, sin línea de fallo, sin parada por `exited`, registro antes del health. El octavo (quitar la comparación del resto de `.env`) sobrevive porque ningún `.env` que pase el control de salto final la alcanza: queda como defensa redundante. |

`probar_preparacion_postgres.py` ya no extrae el bloque del `.md`: **81 casos correctos** (los 85 anteriores menos los 4 de carga, cubiertos ahora aquí). Las claves de prueba usan el mismo formato que escribe `rotar` (64 hex y salto de línea, modo 600).

Límite: no prueba Docker ni la app reales. La primera ejecución real será la de la ventana; `--comprobar` es de solo lectura y puede ejecutarse antes sobre staging.

Manifest vigente: `5426132bfe9256673d292e8401d32ecf4940287872e1c06b3d9d73655c9ce44e`.
