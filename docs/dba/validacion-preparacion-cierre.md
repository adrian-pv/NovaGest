# Validación de la preparación

Fecha: 21/10/2026, America/Mexico_City. Este registro no acredita ejecución de los cambios preparados.

- `bash -n`: correcto en rotar-staging-coordinado.sh, corregir-historial-staging.sh y verificar-staging-final.sh.
- `--plan`: los tres imprimen su secuencia y terminan correctamente sin pedir sudo, conectarse ni cambiar nada.
- Argumento de rotación fuera de la lista: rechazado antes de cualquier acción.
- Siete archivos del paquete contrastados con SHA256SUMS; manifest SHA-256 `c6541023ebafe122d534843e8ec5827dc7d76113935661e0fab436a7611d8861`.
- `git diff --check`: sin errores.
- Inspección de alcance: rotación solo contiene dos roles de staging; psql administrador usa socket local/puerto/usuario/base explícitos. El script no lee archivos de entorno ni llama Docker/tramites-ctl. El único cambio persistente del script ACL es REVOKE en una tabla.
- SQL revisado estáticamente: guardia READ ONLY, EXPLAIN sin ANALYZE, conteos agregados y ROLLBACK. No se ejecutó SQL nuevo sobre el servidor para ensayar la preparación. Su validación operativa queda para la ejecución autorizada; cualquier fallo de la guardia impide cerrar.
- GitHub: #85 y #88 con cuatro checks verdes antes de ampliar esta documentación; los checks del nuevo commit se registran por separado en el PR. No se sustituyen con las 625 pruebas anteriores.
- Deploy disabled_manually y cero queued/in_progress/waiting/requested/pending al consultar a las 18:41. Health UP consultado sin sudo a las 18:30. Revalidar al inicio de la ventana.

No se ejecutaron REVOKE, \password, sudo, reinicios, nuevas migraciones, cierres de PR ni cambios de protección. No se enviaron contraseñas ni mensajes de coordinación a terceros; los textos están preparados para aprobación/revisión.

## Revisión final de preparación

Se corrigieron tres riesgos antes de ejecutar: comprobación de SET ROLE owner además de USAGE en precondición/guardia; recuperación individual sin señal DBA_LISTO; pausa interactiva explícita antes de la recreación documentada de Adrián. La propuesta SQL usa ahora una sola referencia canónica, evitando una variante manual con menos precondiciones.

Validación local ampliada: 26 comprobaciones correctas (sintaxis de tres scripts, --plan y modo sin argumentos, rechazo de argumentos inválidos, bloques Bash de documentación, siete hashes/copias privadas, V9/V10 intactas en HEAD y develop consultado, revisión acotada de patrones sensibles). Evidencia local: validacion-local-cierre.json. El control de patrones no sustituye Gitleaks ni certifica ausencia universal de secretos. No se ejecutaron SQL nuevo, cambios de clave, comandos Docker ni caminos privilegiados. El helper de validación local está fuera del PR, dentro del área exclusiva de NovaGest.

Hash vigente del manifest: c6541023ebafe122d534843e8ec5827dc7d76113935661e0fab436a7611d8861. El manifest anterior 92b88a… corresponde al paquete previo y no debe usarse para ejecutar esta versión.
