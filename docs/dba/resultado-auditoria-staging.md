# Resultado verificado de auditoría de staging

Auditoría ejecutada por el usuario: 21/10/2026 18:07:12 America/Mexico_City (22/10 00:07:12 UTC). Se leyó completo el reporte local `auditoria-dba-staging-20261022-000216Z.txt`, incluidos el contexto SQL y el cierre de transacción.

El reporte original incluye prompts iniciales de sudo, que no se publican. La salida SQL completa sin esos prompts se conserva en el expediente local, SHA-256 `989ee7ad3378a68014837b1819a92994625559ed961ffff718ebfb9082828015`. Este documento transcribe los resultados relevantes; omite direcciones y datos de acceso del servidor. No se publican contraseñas ni datos de ciudadanos.

| Evidencia SQL | Resultado |
| --- | --- |
| current_database / transaction_read_only | tramites_pruebas / on |
| Inventario pg_class de tramites | 67 objetos: 15 tablas, 40 índices y 12 secuencias. Todos relowner=tramites_owner. |
| Inventario pg_proc de tramites | Una función, propietario tramites_owner. |
| Owner y migrador | Owner NOLOGIN; migrador miembro con inherit_option=t, set_option=t y admin_option=f. |
| Columnas V9/V10 | 21; identidad ALWAYS y tipos/nulabilidad coinciden con las migraciones y entidades. |
| Restricciones V9/V10 | 31, incluidas NOT NULL de PostgreSQL 18; convalidated=t en todas. |
| Índices V9/V10 | Nueve; indisvalid=t e indisready=t en todos. |
| Historial | En tramites; no hay flyway_schema_history en public. Nueve versiones: 1,2,3,4,5,6,8,9,10; todas success=t e installed_by=tramites_owner. |
| V9 | checksum esperado=-956879505, observado=-956879505, coincide=t, success=t. |
| V10 | checksum esperado=-130265834, observado=-130265834, coincide=t, success=t. |
| TLS activo | Diez sesiones de tramites_app, ssl=t, TLSv1.3, TLS_AES_256_GCM_SHA384. |
| Datos de pago | Total=0; resueltos_sin_fecha=0, mime_no_admitido=0, hash_no_sha256=0, rechazo_sin_comentario=0. |
| Cierre | ROLLBACK y mensaje FIN presentes; no se modificaron objetos ni datos. |

## Hallazgo de privilegios

En tramites.flyway_schema_history, la fila de tramites_app muestra:

```text
sel=t ins=t upd=t del=t trunc=f referencia=f disparador=f
```

La ACL directa observada fue:

```text
{tramites_owner=arwdDxtm/tramites_owner,tramites_app=arwd/tramites_owner}
```

El mismo DML se concede por defecto a todas las tablas que cree el owner en tramites. Por eso la excepción del historial debe quedar documentada. La auditoría no cambió esos permisos.

Se preparó una [propuesta de corrección](correccion-permisos-historial.md), pendiente de autorización y ejecución. No se requiere cambiar propietarios. No se certifica TLS histórico de sesiones del migrador ya cerradas ni se confunde cero pagos con validación funcional completa.

Referencias: [issue #87](https://github.com/ernestosantizo2003/NovaGest/issues/87), [revisión DBA](revision-V9-V10.md). El dictamen favorable definitivo sigue sin emitirse.
