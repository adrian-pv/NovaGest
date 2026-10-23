# Texto de dictamen de cierre para revisión

**Estado vigente: CAMBIOS REQUERIDOS ANTES DEL CIERRE. No APROBADO; producción no autorizada.**

La auditoría de solo lectura de tramites_pruebas, finalizada con ROLLBACK, confirma que V9__pagos.sql y V10__tipo_cambio.sql son estructuralmente compatibles con las entidades y servicios revisados. Los 67 objetos pertenecen a tramites_owner; las nueve migraciones son exitosas; los checksums de V9/V10 coinciden. Las sesiones activas verificadas usaban TLS1.3. No se requiere cambiar propietarios, recrear tablas ni editar migraciones aplicadas.

El cierre permanece pendiente de dos controles de seguridad: retirar los privilegios de tramites_app sobre el historial Flyway y rotar las claves expuestas de tramites_migrador/tramites_app en una ventana conjunta. Después debe obtenerse evidencia de autenticación nueva, misma imagen/red/volúmenes, historial inalterado, permisos mínimos y ausencia de errores posteriores al relevo. Las acciones están preparadas; no se ejecutaron durante esta preparación.

Las observaciones de V9 sobre fecha de validación, comentario de rechazo y coherencia entre estado/validador/fecha se mantienen como mejoras documentadas no bloqueantes por sí mismas: Java ya aplica esas reglas y la tabla pago estaba vacía al auditar. Si se adoptan CHECK adicionales, deben ir en una futura V11 revisada, sin modificar V9/V10 ni inventar datos. MIME/hash/tamaño y catálogo SQL de monedas requieren decisión de contrato.

V10 conserva la interpretación de las once monedas y la unicidad fecha/moneda. #91, merge 9c6373e en develop, corrige la resolución concurrente de pagos y la colisión de inserciones de cotizaciones, con 634 pruebas CI correctas. La validación del proveedor queda parcialmente atendida: se identificaron bordes de redondeo y un escenario de coherencia de respuesta por probar, detallados en la [revisión existente](revision-V9-V10.md). No se acredita despliegue ni validación de esos arreglos en staging. Ninguno resuelve ACL/credenciales ni sustituye la auditoría independiente de Claude o la evidencia final. V9/V10 permanecen intactas.

La aprobación favorable definitiva solo se preparará después de revisar los resultados finales. Se mostrará al usuario antes de registrarla como APROBADO. Cualquier autorización de producción, modificación de sus credenciales o integración de PR es independiente. CODEOWNERS y controles de ramas requieren configuración del administrador; el documento no afirma que ya sean obligatorios.

Expediente y responsabilidades: [plan único](plan-cierre-staging.md), [revisión técnica V9/V10](revision-V9-V10.md), [ACL](correccion-permisos-historial.md), [rotación](rotacion-staging-coordinada.md), [auditoría posterior](verificacion-final-staging.md).
