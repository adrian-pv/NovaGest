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

Hash del manifest en esa fecha: b1e58c1dc161b27022f65a3dc304b0eee1b6013356b6dabe8ff03b4de1d3e589. **Ya no es el vigente:** ese paquete daba OK con comprobaciones fallidas (ver abajo). Manifest vigente: `445ae506278cca11370fab615b2ba85f91a1a2c8b5109d184e279720683ab72a`.

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

Manifest vigente: `445ae506278cca11370fab615b2ba85f91a1a2c8b5109d184e279720683ab72a`.
