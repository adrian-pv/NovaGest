# Plan único de cierre DBA e infraestructura de staging

**Preparación, no ejecución. Producción no está autorizada.** Este plan sustituye instrucciones antiguas de rotación y reinicio incluidas en registros históricos.

Entrega: [expediente de 16 secciones](expediente-entrega-staging.md), [informe antes/después de 19 criterios](verificacion-final-staging.md#informe-antesdespues), [revalidación GitHub y acciones para Ernesto](evidencia-github.md). Health sin sudo a las 01:04:46 UTC del 22/10: UP. Deploy reconsultado: disabled_manually, cero en cada estado activo. PostgreSQL conserva como evidencia la auditoría terminada; no se repitió una auditoría privilegiada.

## Estado real consultado el 21/10/2026

La comprobación SSH sin sudo de las 18:30 America/Mexico_City obtuvo health UP. Deploy continúa disabled_manually; los ocho runs recientes consultados estaban completed y una consulta específica de todos los estados activos debe repetirse justo antes de la ventana. #84 abierto/borrador, #85 abierto/listo para revisión y #88 abierto/borrador. #85 y #88 tenían sus cuatro checks verdes; #88 conserva las 625 pruebas ya verificadas. No se repitieron migraciones ni la auditoría privilegiada terminada.

A las 18:41 se consultaron por separado los estados queued, in_progress, waiting, requested y pending del workflow Deploy: **cero en cada uno**. Es una comprobación actual de preparación; se revalida al comenzar la ventana y no sustituye la confirmación de operaciones manuales con Adrián.

Evidencia DBA existente: 67 objetos bajo owner, nueve migraciones exitosas, checksums correctos, diez sesiones TLS1.3, READ ONLY/ROLLBACK. Pendiente: acceso excesivo de app al historial, rotación de las dos claves expuestas y verificación posterior. La configuración limpia de SET ROLE/currentSchema y eliminación de duplicados fue confirmada por Adrián y el usuario; no se fingió una nueva inspección privilegiada del contenedor.

## Clasificación para el dictamen #87

| Clase | Punto / responsable |
| --- | --- |
| Bloquea cierre DBA | Exceso de permisos del historial: DBA propone REVOKE acotado, respaldo y prueba negativa; requiere autorización y evidencia de aplicación. |
| Bloquea cierre de seguridad de staging | Dos credenciales de staging expuestas: DBA rota ambas; Adrián actualiza .env y recrea una sola vez; verificación conjunta posterior. |
| Bloquea evidencia final | Demostrar imagen/pool/TLS/ACL/historial/datos después del relevo, sin errores de autenticación posteriores ni impacto operativo. |
| Mejora no bloqueante de integridad actual | V9 no obliga todas las reglas de fecha/comentario en SQL, pero Java sí las aplica y pago tiene cero filas; documentar aceptación o futura V11. |
| Requiere nueva migración si se adopta | CHECK de resolución coherente, rechazo comentado, MIME/hash/tamaño o catálogo de monedas; propuesta separada, no crear V11 ejecutable ahora. |
| Equipo de aplicación | Resoluciones concurrentes de un mismo pago y exists/save de cotizaciones; bloqueo/versionado e inserción idempotente por PR con pruebas. No es una reparación de propietarios. |
| Gobierno de repositorio | Ernesto configura exigencia de PR, code owners y checks; el ruleset solo impide borrado/force-push. CODEOWNERS solo no impide fusionar. |
| Retirada de propuesta obsoleta | Cerrar #84 sin fusionar, solo cuando el usuario lo autorice. #85 lo revisa Ernesto; no fusionamos. |

Dictamen para revisión: **CAMBIOS REQUERIDOS ANTES DEL CIERRE**. V9/V10 son estructuralmente compatibles con observaciones, con propietarios y checksums correctos. Ese estado no equivale a APROBADO ni autoriza producción. Tras aplicar y verificar corrección/rotación, el usuario revisará un dictamen favorable antes de publicarlo.

## Secuencia y autorizaciones

1. Preparación terminada: revisión, scripts sin secretos, respaldos/procedimientos especificados, mensajes de coordinación en borrador.
2. **Primera operación a autorizar:** sudo para respaldar historial y evidencias de negocio, aplicar únicamente REVOKE ALL a tramites_app sobre tramites.flyway_schema_history y verificar. No incluye contraseñas ni reinicio. [Procedimiento](correccion-permisos-historial.md).
3. Autorizar por separado una ventana conjunta de 30 minutos para migrador→app. El usuario eligió entrada directa en ambas terminales; Adrián debe confirmar disponibilidad y aceptación del relevo. [Pasos de rotación y recreación única](rotacion-staging-coordinada.md).
4. Adrián hace exclusivamente su fase tras DBA_LISTO, con la misma imagen/Compose/red/volúmenes. DBA no reinicia desde sus scripts. Su recreación necesita la autorización correspondiente.
5. Autorizar comprobaciones finales que requieran sudo; luego [auditoría final](verificacion-final-staging.md), conciliación de evidencias y revisión del dictamen. No habilitar Deploy automáticamente.
6. Autorizaciones independientes: cerrar #84 sin fusionar; cualquier merge; modificar reglas/permissions GitHub; cualquier nueva migración. Nada de ello queda autorizado por aprobar el REVOKE.

## Paquete revisable y pasos exactos de preparación

Scripts en [scripts/](scripts/), manifest [SHA256SUMS](scripts/SHA256SUMS). No son migraciones de la aplicación y no se ejecutan desde CI ni al arrancar. Los scripts shell muestran el plan sin argumentos o con --plan; las opciones de ejecución requieren root y autorización. Los modos de recuperación por rol no se usan para la rotación normal de ambos.

Después de autorización, copiar únicamente el paquete, nunca credenciales. La ruta local de trabajo y config SSH es la ya exclusiva de NovaGest. Las órdenes PowerShell/RTK exactas se conservan en `NovaGest-Infra/docs/ejecucion-cierre-staging.md`, junto al hash del manifest fijado para verificar la copia de root. No se ha subido ni ejecutado el paquete en el servidor durante esta preparación.

Antes de ejecutar cada script, verificar todos los hashes desde una carpeta privada de root y ejecutar bash -n. El cambio ACL usa `corregir-historial-staging.sh --aplicar`; la rotación usa `rotar-staging-coordinado.sh rotar`; la verificación usa `verificar-staging-final.sh --verificar <ID sha256 previo>`. No ejecutar REVOKE, \password ni sudo durante la revisión de este documento.

## Evidencias faltantes para la revisión final de #88

- Respaldo real posterior a autorización y resultado de REVOKE/guardia (aún no existen).
- Dos autenticaciones nuevas por TLS tras cada rotación y tras la recreación (aún no ejecutadas).
- ID de imagen y topología antes/después; snapshot de negocio conciliado; logs acotados y conformidad del responsable de NavControl.
- Revisión independiente de Ernesto y activación de controles GitHub. La cuenta DBA tiene write, no admin; no se cambiaron reglas.
- Horario y conformidad de Adrián para la ventana. El mecanismo fue elegido por el usuario; no se presume una reunión ya acordada.

Los checks verdes validan el código/documentación propuestos; no sustituyen esas evidencias operativas. Los scripts nuevos se revisan estáticamente y con sus modos sin efectos; los caminos privilegiados permanecen sin ejecutar hasta autorización.
