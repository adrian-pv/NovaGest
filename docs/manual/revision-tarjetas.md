# Revisión de las tareas de Brandom

Se contrastaron Notion, los issues asignados a Blemus23, los PR y el código.
El MCP de Gmail no proporcionó acceso confirmado al buzón institucional. Las búsquedas de NovaGest, el nombre completo del repositorio y notifications@github.com (incluyendo spam/papelera) no devolvieron mensajes. La evidencia de esta revisión procede de GitHub; no se acredita una revisión completa del correo.

## Fuentes y diferencias resueltas

La tarjeta [24 de Notion](https://app.notion.com/p/3ee4e9c74a5c811a9b8af695ef17b768) pedía un usuario por rol y un arranque en 15 minutos.
El [issue #33](https://github.com/ernestosantizo2003/NovaGest/issues/33) amplía el criterio a dos ciudadanos. Prevalece ese criterio más completo en esta entrega.
Las tarjetas 30–43 no aparecieron en las búsquedas del MCP de Notion; sus requisitos se contrastaron con los issues y PR.

| Tarjeta | Fuente | Resultado |
| --- | --- | --- |
| 24 | [#33](https://github.com/ernestosantizo2003/NovaGest/issues/33), [PR #58](https://github.com/ernestosantizo2003/NovaGest/pull/58) | Añadida la segunda cuenta ciudadana mediante un nuevo script repetible exclusivo de dev, sin editar migraciones versionadas. Se conserva la clave por variable y se actualizan pruebas de login, aislamiento e idempotencia |
| 30 | [PR #63](https://github.com/ernestosantizo2003/NovaGest/pull/63) | React, Vite, TypeScript y verificación ya integrados |
| 32 | [PR #68](https://github.com/ernestosantizo2003/NovaGest/pull/68) | Diseño y navegación por permisos ya integrados; reutilizados |
| 33 | [PR #70](https://github.com/ernestosantizo2003/NovaGest/pull/70) | Lista, creación, edición, detalle e historial ya integrados |
| 34 | [#44](https://github.com/ernestosantizo2003/NovaGest/issues/44), [PR #72](https://github.com/ernestosantizo2003/NovaGest/pull/72) | Subida, validación del archivo, errores, estado y descarga ya integrados |
| 35 | [PR #73](https://github.com/ernestosantizo2003/NovaGest/pull/73) | Bandeja por colas ya integrada |
| 36 | [#46](https://github.com/ernestosantizo2003/NovaGest/issues/46) | Se completa /pagos: pendientes paginados por antigüedad, descarga, validación/rechazo con confirmación y segregación. También se conserva la resolución desde el detalle del trámite |
| 43 | [#53](https://github.com/ernestosantizo2003/NovaGest/issues/53), [PR #67](https://github.com/ernestosantizo2003/NovaGest/pull/67) | Manual por rol y guion actualizados con las rutas reales; se agregan nueve capturas del frontend en navegador con API simulada y datos ficticios |

## Validación y límites

Las pruebas de frontend comprueban decisiones, comentarios, permisos, pago propio, conflictos, recarga de historial, lista de pendientes, descarga, orden, paginación y recuperación de errores.
Las capturas se obtienen ejecutando el frontend real con Playwright/Edge, pero las respuestas de API son simuladas: no acreditan operación del backend ni un ensayo de diez minutos.
Las pruebas de datos demo requieren Docker. El intento local no pudo iniciar Testcontainers porque Docker no estaba activo; la CI del PR debe validar esas pruebas.
Los scripts anteriores y las migraciones versionadas se conservan. La nueva cuenta se agrega también a bases dev existentes sin borrar datos.
No se da por aprobado el acuerdo con DBA ni se ejecutan operaciones de staging o producción.

## Revisión humana

El PR #93 concentra estas correcciones para revisión de Frank (flacan1), según CONTRIBUTING.md.
El PR #92 (acuerdo DBA) continúa separado y sin aprobación externa acreditada.
Los issues 24, 34, 36 y 43 continúan abiertos mientras no se complete la revisión y la integración.
