# Revisión de las tarjetas 24, 30, 32–36 y 43

Se compararon las fuentes de Notion accesibles por MCP, los PR de GitHub y develop.
La tarjeta [24 en Notion](https://app.notion.com/p/3ee4e9c74a5c811a9b8af695ef17b768) exige un usuario por rol y un arranque en 15 minutos; figura como Hecho.
El MCP conectado no devuelve las tarjetas 30–43 en búsquedas ni en la vista del tablero consultada. Por tanto, sus criterios específicos de Notion no pudieron verificarse; se usan los PR y las indicaciones del código, con autorización del usuario para continuar.

| Tarjeta | Evidencia integrada | Resultado de esta revisión |
| --- | --- | --- |
| 24 | [PR #58](https://github.com/ernestosantizo2003/NovaGest/pull/58), db/dev/R__datos_demo.sql y README | Ya contiene las cuatro cuentas y tercer tipo demo; manual actualizado con uso y limitaciones |
| 30 | [PR #63](https://github.com/ernestosantizo2003/NovaGest/pull/63), frontend/package.json y vite.config.ts | React, Vite, TypeScript y verificación configurados; conservados |
| 32 | [PR #68](https://github.com/ernestosantizo2003/NovaGest/pull/68), componentes y navegación | Diseño y menú por permisos ya integrados; reutilizados |
| 33 | [PR #70](https://github.com/ernestosantizo2003/NovaGest/pull/70), frontend/src/tramites | Lista, creación, edición, detalle e historial ya integrados; manual completado |
| 34 | [PR #72](https://github.com/ernestosantizo2003/NovaGest/pull/72), SeccionPago.tsx | Subida, estado y descarga ya integrados; reutilizados para la revisión del gestor |
| 35 | [PR #73](https://github.com/ernestosantizo2003/NovaGest/pull/73), Bandeja.tsx | Colas y detalle ya integrados; guion actualizado para usarlos |
| 36 | Pendiente explícito en el comentario de SeccionPago.tsx de develop | Implementadas validación/rechazo con confirmación, motivo obligatorio, segregación, errores y recarga de pago/trámite/historial/acciones |
| 43 | [PR #67](https://github.com/ernestosantizo2003/NovaGest/pull/67), manual y guion iniciales | Manual por rol y recorrido actualizados con pantallas reales y funciones aún disponibles solo en la API |

La tarjeta 36 usa el endpoint existente POST /api/pagos/{id}/validacion: no cambia API, migraciones ni reglas del servidor.
Las acciones aparecen en cada pago pendiente dentro del detalle del trámite, como indica la extensión prevista por la tarjeta 34.
La cola Esperando pago de la bandeja permite llegar a esos detalles; no se añade una lista global de pagos.

## Validación

La suite de frontend cubre los flujos existentes y las nuevas decisiones de pago.
Resultado local: 501 pruebas aprobadas en 25 archivos con npm run test -- --maxWorkers=2 --testTimeout=15000.
El límite se amplió solo para esta ejecución: una prueba preexistente del editor de 30 campos excedía cinco segundos en este equipo; no se modificaron las pruebas de ese editor ni su configuración.
Las pruebas nuevas comprueban confirmación, rechazo con motivo, actualización de estado e historial, cuentas sin permiso, pago propio, pagos ya resueltos, cancelación y errores 403/409.
La validación automatizada usa respuestas de API simuladas; no acredita un ensayo manual con el backend desplegado.
No se añaden capturas simuladas ni se registra como realizado el ensayo de diez minutos: el guion incluye cómo recoger esa evidencia con el entorno real.

## Revisión humana

CONTRIBUTING.md asigna la revisión de los cambios de Brandom a Frank.
La cuenta de Frank se identifica como flacan1 por sus PR de usuarios/roles, ingresos y divisas.
Se debe solicitar su revisión del PR hacia develop.
La aprobación y el merge siguen pendientes hasta que los complete el equipo.
