# Validación de la preparación

Fecha: 21/10/2026, America/Mexico_City. Este registro no acredita ejecución de los cambios preparados.

- `bash -n`: correcto en rotar-staging-coordinado.sh, corregir-historial-staging.sh y verificar-staging-final.sh.
- `--plan`: los tres imprimen su secuencia y terminan correctamente sin pedir sudo, conectarse ni cambiar nada.
- Argumento de rotación fuera de la lista: rechazado antes de cualquier acción.
- Siete archivos del paquete contrastados con SHA256SUMS; manifest SHA-256 `31eaa71263b6c5bc1cf1f429ca47de5285ba05552531d27132c6352eb9064b60`.
- `git diff --check`: sin errores.
- Inspección de alcance: rotación solo contiene dos roles de staging; psql administrador usa socket local/puerto/usuario/base explícitos. El script no lee archivos de entorno ni llama Docker/tramites-ctl. El único cambio persistente del script ACL es REVOKE en una tabla.
- SQL revisado estáticamente: guardia READ ONLY, EXPLAIN sin ANALYZE, conteos agregados y ROLLBACK. No se ejecutó SQL nuevo sobre el servidor para ensayar la preparación. Su validación operativa queda para la ejecución autorizada; cualquier fallo de la guardia impide cerrar.
- GitHub: #85 y #88 con cuatro checks verdes antes de ampliar esta documentación; los checks del nuevo commit se registran por separado en el PR. No se sustituyen con las 625 pruebas anteriores.
- Deploy disabled_manually y cero queued/in_progress/waiting/requested/pending al consultar a las 18:41. Health UP consultado sin sudo a las 18:30. Revalidar al inicio de la ventana.

No se ejecutaron REVOKE, \password, sudo, reinicios, nuevas migraciones, cierres de PR ni cambios de protección. No se enviaron contraseñas ni mensajes de coordinación a terceros; los textos están preparados para aprobación/revisión.
