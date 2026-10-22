# Validación de la preparación

Fecha: 21/10/2026, America/Mexico_City. Este registro no acredita ejecución de los cambios preparados.

- `bash -n`: correcto en rotar-staging-coordinado.sh, corregir-historial-staging.sh y verificar-staging-final.sh.
- `--plan`: los tres imprimen su secuencia y terminan correctamente sin pedir sudo, conectarse ni cambiar nada.
- Argumento de rotación fuera de la lista: rechazado antes de cualquier acción.
- Siete archivos del paquete contrastados con SHA256SUMS; manifest SHA-256 `b1e58c1dc161b27022f65a3dc304b0eee1b6013356b6dabe8ff03b4de1d3e589`.
- `git diff --check`: sin errores.
- Inspección de alcance: rotación solo contiene dos roles de staging; psql administrador usa socket local/puerto/usuario/base explícitos. El script no lee archivos de entorno ni llama Docker/tramites-ctl. El único cambio persistente del script ACL es REVOKE en una tabla.
- SQL revisado estáticamente: guardia READ ONLY, EXPLAIN sin ANALYZE, conteos agregados y ROLLBACK. No se ejecutó SQL nuevo sobre el servidor para ensayar la preparación. Su validación operativa queda para la ejecución autorizada; cualquier fallo de la guardia impide cerrar.
- GitHub: #85 y #88 con cuatro checks verdes antes de ampliar esta documentación; los checks del nuevo commit se registran por separado en el PR. No se sustituyen con las 625 pruebas anteriores.
- Deploy disabled_manually y cero queued/in_progress/waiting/requested/pending al consultar a las 18:41. Health UP consultado sin sudo a las 18:30. Revalidar al inicio de la ventana.

No se ejecutaron REVOKE, \password, sudo, reinicios, nuevas migraciones, cierres de PR ni cambios de protección. No se enviaron contraseñas ni mensajes de coordinación a terceros; los textos están preparados para aprobación/revisión.

## Revisión final de preparación

Se corrigieron tres riesgos antes de ejecutar: comprobación de SET ROLE owner además de USAGE en precondición/guardia; recuperación individual sin señal DBA_LISTO; pausa interactiva explícita antes de la recreación documentada de Adrián. La propuesta SQL usa ahora una sola referencia canónica, evitando una variante manual con menos precondiciones.

Validación local ampliada: 26 comprobaciones correctas (sintaxis de tres scripts, --plan y modo sin argumentos, rechazo de argumentos inválidos, bloques Bash de documentación, siete hashes/copias privadas, V9/V10 intactas en HEAD y develop consultado, revisión acotada de patrones sensibles). Evidencia local: validacion-local-cierre.json. El control de patrones no sustituye Gitleaks ni certifica ausencia universal de secretos. No se ejecutaron SQL nuevo, cambios de clave, comandos Docker ni caminos privilegiados. El helper de validación local está fuera del PR, dentro del área exclusiva de NovaGest.

Hash vigente del manifest: b1e58c1dc161b27022f65a3dc304b0eee1b6013356b6dabe8ff03b4de1d3e589. El manifest anterior 92b88a… corresponde al paquete previo y no debe usarse para ejecutar esta versión.

## Ejecución principal Codex y respaldo — 22/10/2026 01:25–01:28 UTC

Se mantiene el paquete existente. Codex asume ejecución DBA/staging; Claude revisa independientemente y sus hallazgos críticos deben quedar incorporados antes de cualquier operación privilegiada. No se accedió a su carpeta. Consultados #87/#88: sin comentarios ni revisiones formales entregadas en esos canales; no se presume conformidad del auditor.

Revalidación: health UP a las 01:25:06 UTC, Deploy disabled_manually y cero queued/in_progress/waiting/requested/pending. Por SSH sin sudo se comprobó disponibilidad de psql, pg_dump, pg_restore, flock, sha256sum, runuser, python3 y curl. pg_restore informa PostgreSQL 18.6. Una entrada sintética inválida por stdin fue rechazada por pg_restore --file=/dev/null con código 1, sin --dbname ni conexión/restauración; es una prueba negativa del lector, **no la validación de un respaldo real**.

El helper de ACL añade lectura completa del dump sin conexión y hashes del respaldo/evidencias antes de REVOKE, revalidación de los originales y hashes de salidas después. No se ejecutó su camino --aplicar; el respaldo real y sus hashes aún no existen. Se repitieron las 26 comprobaciones locales sobre el paquete nuevo y resultaron correctas. Las pruebas SQL/privilegiadas y la restauración real siguen pendientes de autorización; los checks del nuevo commit se registran aparte en #88.
