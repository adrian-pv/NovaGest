# Expediente de entrega DBA e infraestructura de NovaGest

Estado al 22/10/2026 01:04–01:10 UTC (21/10, America/Mexico_City). **CAMBIOS REQUERIDOS ANTES DEL CIERRE**. Es una entrega de revisión y preparación; las operaciones pendientes no se presentan como ejecutadas. Índice operativo: [plan único](plan-cierre-staging.md).

Actualización posterior: [revisión de #91](revision-V9-V10.md) integrado en develop (9c6373e), con 634 pruebas CI correctas. No acredita despliegue en staging ni modifica las condiciones de autorización, respaldo/REVOKE, rotación o auditoría final.

## 1. Resumen ejecutivo

La auditoría real de staging concluyó con READ ONLY y ROLLBACK. V9/V10 pasan estructura, propietarios y checksums. La nueva consulta SSH sin sudo obtuvo health UP a las 01:04:46 UTC. Falta restringir el historial Flyway, rotar dos credenciales y verificar después. El issue #87 sigue abierto, sin aprobación definitiva. No se ejecutaron cambios PostgreSQL, reinicios ni despliegues durante esta preparación.

## 2. Arquitectura PostgreSQL

PostgreSQL 18 en daniel1, fuera del contenedor de aplicación. Compose conecta la app de staging mediante la red existente al PostgreSQL del host. API de staging en loopback, puerto 8081. El esquema funcional y el historial Flyway están en tramites. No se reconstruye el esquema ni se sustituyen redes. Los datos y comprobantes deben conservarse durante la recreación de la app.

## 3. Base y roles

| Elemento | Estado acreditado |
| --- | --- |
| Base / esquema | tramites_pruebas / tramites |
| tramites_owner | NOLOGIN, propietario efectivo de los 67 objetos pg_class y una función. |
| tramites_migrador | LOGIN para Flyway; miembro de owner con INHERIT y SET, sin ADMIN OPTION. |
| tramites_app | LOGIN de aplicación; sin superusuario, creación de roles/bases, replicación ni BYPASSRLS. Sin CREATE en esquema/base. |

No procede ALTER OWNER. La diferencia entre usuario autenticado y current_user después de SET ROLE explica técnicamente cómo el migrador crea objetos bajo owner. No se encontró la consulta original que motivó la interpretación anterior de Adrián: no se atribuye una causa histórica como hecho. Véase [revisión y trazabilidad](revision-V9-V10.md).

## 4. Privilegios y controles

La app tiene CRUD de negocio y USAGE/SELECT en secuencias, sin UPDATE de secuencias. Hallazgo abierto: también tiene SELECT/INSERT/UPDATE/DELETE sobre flyway_schema_history. La [corrección](correccion-permisos-historial.md) retira todos sus privilegios directos exclusivamente en esa tabla, conserva migrador/owner y compara historial, conteos y permisos antes/después. Está preparada, sin ejecutar ni autorizar.

La guardia comprueba tanto privilegios efectivos como ausencia de capacidad de SET ROLE al owner: NOINHERIT no basta si el rol pudiera asumirlo. [Semántica PostgreSQL de USAGE y SET](https://www.postgresql.org/docs/18/functions-info.html#FUNCTIONS-INFO-ACCESS-TABLE). Los default privileges del owner explican el alcance inicial del GRANT; no se eliminan los defaults de negocio. La excepción debe verificarse tras restauraciones, GRANT generales y futuros despliegues; aún no está integrada automáticamente en CI/despliegue.

## 5. Flyway

Conexión como migrador y único SPRING_FLYWAY_INIT_SQLS=SET ROLE tramites_owner, según confirmación de Adrián. currentSchema=tramites conservado. Compose aporta las credenciales Flyway desde .env; Adrián retiró duplicados de app.env. La nueva inspección privilegiada de configuración queda reservada a la ventana autorizada. Nueve filas exitosas con installed_by=tramites_owner; sin historial duplicado en public.

## 6. Migraciones y revisión

Versiones registradas: V1–V6, V8, V9, V10. No se inventa V7. V9 pagos y V10 tipo_cambio coinciden con 21 columnas, 31 restricciones validadas y nueve índices válidos/listos. CRC32 Flyway: V9 -956879505; V10 -130265834. Los SHA-256 de blobs Git están en [checksums-migraciones.json](checksums-migraciones.json). V9/V10 permanecen intactas también frente al develop consultado 3782c99de2cb0cbdc49f3729aef9f98c064d09f6; no se creó V11 ejecutable.

V9: coherencia estado/validador/fecha y comentario de rechazo son candidatos a [V11 documental](propuesta-V11-coherencia-pagos.md). Java aplica esas reglas en su flujo normal, pero pago=0 no demuestra por sí solo todos los casos funcionales. MIME/hash/tamaño y coherencia ciudadano/trámite requieren decidir contrato; no imponer creado_por=ciudadano. V10 es compatible con las once monedas y sus diferentes convenciones; conservar UNIQUE(fecha,moneda), el índice de búsqueda y la fecha real del proveedor. Las carreras de resolución y de inserción de cotizaciones, y la validación de filas del proveedor, corresponden a Java y pruebas de aplicación.

## 7. Auditoría y cadena de evidencia

Auditoría ejecutada por el usuario a las 00:07:12 UTC del 22/10. Se preserva el reporte original local auditoria-dba-staging-20261022-000216Z.txt, SHA-256 ed7d3f007d59ed6cbe85fd3b1c3800deed8b9df97403458e31aab32afa4a0f2e. No se publica porque incluye prompts iniciales de autenticación. El extracto SQL completo sin prompts tiene SHA-256 989ee7ad3378a68014837b1819a92994625559ed961ffff718ebfb9082828015. Ambos hashes se revalidaron en esta revisión. [Resumen publicable](resultado-auditoria-staging.md).

67 objetos = 15 tablas + 40 índices + 12 secuencias; adicionalmente una función. Diez sesiones app TLS 1.3. Pago vacío y conteos agregados de incoherencias candidatos a V11 en cero. La auditoría no modificó datos, objetos ni ACL. No se certifica TLS histórico de sesiones de migración cerradas.

## 8. Respaldo y recuperación

Paquete de ACL preparado: candado cooperativo, carpeta privada root, pg_dump custom solo del historial, ACL y snapshots de negocio, pg_restore --list, REVOKE transaccional, guardia y comparación. **No existe todavía el respaldo de esta operación**. Leer el índice de un dump no equivale a ensayar su restauración. Antes de COMMIT, fallo revierte; después, conservar evidencia y detener sin GRANT ni restauración automática. Restaurar datos o ampliar permisos requiere decisión independiente. No subir dumps ni archivos de entorno a Git.

La preparación ahora añade lectura completa sin conexión mediante pg_restore --file=/dev/null y hashes verificados del dump/evidencias antes de permitir REVOKE. Se sellan también las salidas posteriores. Ni lectura offline ni hashes sustituyen una restauración ensayada; esa validación real sigue sin ejecutarse.

## 9. Rotación coordinada

[Procedimiento exacto](rotacion-staging-coordinada.md), pendiente de autorización y horario confirmado: migrador → app, pruebas nuevas TLS de ambos, DBA_LISTO, Adrián ejecuta `cargar-recrear-staging.sh --aplicar` (carga FLYWAY_PASSWORD y DB_PASSWORD en staging/.env, una recreación con la misma imagen, health UP en 180 s y línea en deploy.log), ADRIAN_LISTO y verificación. Las claves se generan en daniel1 en un directorio tmpfs solo-root y Adrián las carga en .env desde esos mismos archivos, sin verlas ni transmitirlas; la verificación final comprueba que el contenedor usa exactamente las claves fijadas. Los scripts del DBA no editan entornos ni llaman Docker; el de Adrián sí, solo esas dos líneas y una recreación. Recuperación avanza a otra clave nueva y siempre vuelve a verificar ambos roles. Puede haber interrupción temporal de nuevas conexiones.

## 10. Red, imagen y TLS

Red actual Compose novagest-staging_default, bridge br-nova-stg, subred 172.30.11.0/24 según evidencia existente; nueva captura privilegiada de IDs/topología pendiente. #84 propone redes externas y no debe fusionarse. Adrián conserva Compose, imagen por ID real, red y montajes; no basta conservar etiqueta. docker restart no recarga variables; el despliegue existente hace pull, por lo que se documentó un paso controlado de recreación única sin pull/build. [Opciones Docker](https://docs.docker.com/reference/cli/docker/compose/up/). La verificación final diferencia autenticación por loopback y sesiones TLS nuevas desde el contenedor.

## 11. Comprobaciones antes/después

[Informe de 19 criterios](verificacion-final-staging.md#informe-antesdespues). Solo la columna anterior contiene hechos observados; la posterior sigue pendiente. Health UP actual no demuestra credenciales nuevas ni ACL corregida. Requiere conciliar historial/negocio, imagen/topología, logs posteriores al relevo y conformidad del responsable de NavControl. No se realizó auditoría de producción ni de servicios ajenos.

## 12. CI y preparación

El head anterior de #88, 32a6244, pasó cuatro checks y 625 pruebas Java sin fallos/errores/omitidas (run 39701976294). #85, head 45a8d34, mantiene cuatro checks verdes y su CI principal también informa 625 pruebas sin fallos/errores/omitidas (39690687365); las 589 citadas en su descripción son una ejecución anterior del fork. Trivy fs de #85 informa cero hallazgos en tres archivos analizados, pero no prueba por sí solo la composición completa del jar/imagen ni ausencia universal de CVE. La afirmación previa de OSV permanece atribuida al autor del PR, sin nueva certificación independiente. [Revisión GitHub y acciones para Ernesto](evidencia-github.md).

Diff completo de #88 revisado: documentación, scripts de preparación y CODEOWNERS; no cambios de aplicación, migraciones ni Compose. Validación local y controles de secretos en [registro de preparación](validacion-preparacion-cierre.md). Los nuevos commits deben tener sus propios checks; los anteriores no los sustituyen. Los caminos privilegiados/SQL nuevo no se ensayaron contra staging.

## 13. Riesgos pendientes

| Clasificación | Pendiente |
| --- | --- |
| Bloquea cerrar staging | ACL del historial, credenciales expuestas y evidencia final tras la corrección/recreación. |
| Aplicación | Carreras originales corregidas en develop por #91; validación del proveedor parcial, con bordes/respuestas pendientes según revisión. Despliegue en staging no acreditado. |
| V11 opcional bajo decisión | Reglas SQL de resolución/rechazo y contratos adicionales de comprobantes/monedas; sin datos inválidos actuales demostrados. |
| Gobierno | PR, aprobación, code owners y checks aún no obligatorios; configurar antes de confiar en revisión automática DBA. |
| Producción independiente | Revisión de carreras financieras, respaldo/restauración ensayada, secretos y TLS de ese entorno, autorización de migraciones/despliegue y aceptación funcional. No deducir aprobación por staging UP. |

## 14. Responsables y entrega

Asignación actualizada: Codex es el ejecutor principal DBA/staging; Claude es auditor independiente en su carpeta separada. Codex continúa tareas seguras y registra/incorpora hallazgos críticos antes de ejecutar cambios privilegiados, siempre con autorización explícita. La ausencia de comentarios en GitHub no equivale a una aprobación del auditor. Se preservan las responsabilidades de Adrián, Ernesto y del usuario descritas a continuación.

Rodney/hgfdiuy: evidencia, propuesta ACL, cambio PostgreSQL autorizado y auditoría posterior. Adrián: pausa operativa, imagen/topología, edición privada de ambas variables y recreación única autorizada. Ernesto: revisión independiente #85/#88 y configuración de protecciones. Equipo de aplicación: seguimiento residual de #91 y contrato del proveedor, según revisión enlazada. Usuario: autorizaciones pendientes y revisión del dictamen antes de publicarlo. Mensajes directos preparados localmente, no enviados. Cierre #84 sin merge pendiente de permiso; #85/#88 no fusionados.

## 15. Recomendaciones para producción

Plan separado: verificar mínimos privilegios y excepciones del historial en el entorno real; comprobar certificados y modo de validación TLS; ensayar recuperación con RPO/RTO acordados; definir observabilidad sin secretos, segregación de roles, aceptación de riesgos financieros y pruebas concurrentes. Revisar artefacto resuelto/SBOM y escaneo de imagen para dependencias. Revisar protecciones y autorización de despliegue. No reutilizar claves ni ejecutar procedimientos de staging sobre producción. Ninguna recomendación acredita una comprobación ya realizada allí.

## 16. Conclusión DBA para revisión del usuario

V9/V10 son estructuralmente compatibles con observaciones de integridad y concurrencia; propiedad y checksums pasan. **CAMBIOS REQUERIDOS ANTES DEL CIERRE**: falta aplicar/verificar la excepción de historial, rotar ambas credenciales de staging y completar la evidencia posterior. No editar V9/V10, eliminar tablas, reconstruir esquema ni ejecutar migraciones para cerrar estos hallazgos. El [dictamen](dictamen-cierre-para-revision.md) queda para revisión; no se publica APROBADO hasta revisar resultados finales y obtener conformidad del usuario.
