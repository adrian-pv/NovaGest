# Revisión DBA de V9 y V10

Fecha: 21 de octubre de 2026 (America/Mexico_City). Responsable de revisión: `hgfdiuy`.
Base de código: `develop` en `ae014ddc8ea654a3d5e71e510755f1c363feccda`.
Seguimiento: [issue #87 — Aprobación DBA: migraciones V9 y V10](https://github.com/ernestosantizo2003/NovaGest/issues/87).

## Actualización de aplicación: PR #91 integrado en develop

Ernesto fusionó [#91](https://github.com/ernestosantizo2003/NovaGest/pull/91) el 22/10/2026 a las 01:51:32 UTC: merge `9c6373ec3363181a278fd4137d61e4dcb494bb50`, commits `5b5bbce` y `de63f56`. Se revisaron sus ocho archivos y el código resultante del merge. Solo cambia README, cuatro clases Java y tres archivos de pruebas; no modifica migraciones, dependencias, Compose ni workflows. La revisión original siguiente conserva como línea base ae014ddc; esta sección y las notas actualizadas distinguen su resolución posterior.

| Observación de #87 | Resultado revisado en develop | Límite / seguimiento |
| --- | --- | --- |
| Dos decisiones sobre un mismo pago | Resuelta en el flujo revisado: PagoRepository.bloquearPorId usa PESSIMISTIC_WRITE; resolver mantiene @Transactional y vuelve a comprobar PENDIENTE bajo el bloqueo. La segunda decisión recibe 409. | Tres pruebas: espera determinista, carrera de decisiones y comprobantes simultáneos. No se certifica ausencia universal de deadlocks ni el comportamiento de una imagen no inspeccionada. |
| exists/save concurrente de cotizaciones | Resuelta la colisión de unicidad: INSERT ... ON CONFLICT (fecha,moneda) DO NOTHING conserva UNIQUE y no sobrescribe la fila ganadora. | Seis pruebas de cotizaciones incluyen transacción retenida y carreras reales. Queda por probar la coherencia de respuesta si los competidores traen valores diferentes. |
| Validar filas del proveedor | Atendida parcialmente: rechaza fecha nula/futura, venta nula/no positiva, moneda fuera del enum y exceso de dígitos enteros antes de redondear. | El filtro no cubre todos los valores que se redondean a escala 6; ver casos de frontera abajo. |
| Coherencia SQL V9 y comprobantes | Sin cambios: las reglas de estado/validador/fecha/rechazo y los contratos adicionales siguen como decisión de V11. | No se creó V11 ni se modificó V9/V10; titular del trámite y relojes siguen abiertos. |
| Seguridad operativa | Sin resolver por #91: permisos del historial, credenciales y evidencia posterior siguen pendientes. | Mantener autorización explícita y revisión de hallazgos críticos de Claude antes de operar. |

Evidencia de [CI 39707659446](https://github.com/ernestosantizo2003/NovaGest/actions/runs/39707659446): **634 pruebas, cero fallos/errores/omitidas**, incluidas 3 de PagosConcurrentesTests y 6 de TipoCambioGuardadoTests; cuatro checks del PR verdes. Son pruebas CI de la propuesta integrada, no pruebas ejecutadas por Codex en staging. Las siete mutaciones citadas por el autor en #87 no se reprodujeron en esta revisión.

**Residual numérico comprobado sin base:** el predicado Java actual acepta `0.0000001` y `999999999999.9999999`. En una prueba local JShell con BigDecimal y redondeo HALF_UP a escala 6 dan respectivamente `0.000000` y `1000000000000.000000`: el primero incumpliría CHECK(valor>0), el segundo excedería los 12 enteros de NUMERIC(18,6). PostgreSQL redondea a la escala declarada antes de comprobar precisión ([documentación](https://www.postgresql.org/docs/18/datatype-numeric.html)). No se insertaron estos valores ni se abrió una conexión a staging. Proponer al equipo validar el valor a escala 6 o rechazar pérdida de precisión según contrato, con pruebas de ambos bordes antes de aceptar completamente el filtro. No requiere editar V10 ni cambiar ACL.

**Residual de coherencia inferido del flujo, no reproducido en PostgreSQL:** guardar ignora el resultado 0 de ON CONFLICT y obtener devuelve la venta original del proveedor, sin releer la fila persistida. Si otra transacción conserva 7.65 y esta recibe 7.66 para la misma clave, podría responder 7.66 aunque posteriores consultas usen 7.65. Las pruebas concurrentes actuales usan el mismo valor para ambos competidores. Acordar la política y añadir una prueba con valores distintos; considerar releer el dato ganador. No afirmar pérdida de datos ni corregir la base por este escenario.

**Despliegue no acreditado:** Deploy seguía disabled_manually y la consulta de runs para el merge devolvió cero. Eso no descarta una operación manual; no se inspeccionó el ID de la imagen de staging en esta revisión. No se trasladan estas correcciones a la evidencia operativa anterior ni se cambia la imagen durante la rotación. La recreación acordada conserva el ID registrado antes de la ventana; desplegar #91 requiere otra decisión autorizada. El dictamen sigue CAMBIOS REQUERIDOS ANTES DEL CIERRE.

Cierre operativo actualizado: [plan consolidado](plan-cierre-staging.md), [rotación coordinada](rotacion-staging-coordinada.md) y [verificación final](verificacion-final-staging.md). Adrián y el usuario confirmaron SET ROLE único activo, variables Flyway solo en .env/Compose y currentSchema=tramites. Esa configuración no se modifica desde los scripts DBA. La rotación se limita a migrador→app en una ventana y Adrián recrea una sola vez con la misma imagen. No hay autorización para ejecutarla.

Separación del dictamen: seguridad del historial y claves expuestas bloquean el cierre de seguridad; integridad adicional de V9 y posible catálogo de V10 son mejoras a aceptar/documentar o plantear en V11; las carreras pertenecen al equipo de aplicación. Las condiciones y evidencias faltantes están enumeradas en el plan. No se convierte una propuesta de mejora en una afirmación de datos inválidos existentes.

**Auditoría completada. Propuesta de dictamen: CAMBIOS REQUERIDOS en privilegios del historial Flyway antes de producción.** No registra una aprobación definitiva ni autoriza despliegues o correcciones.
V9/V10 son estructuralmente compatibles con JPA y con el catálogo observado, con las observaciones detalladas abajo. La propiedad y los checksums son correctos. El hallazgo pendiente es que `tramites_app` puede escribir en `flyway_schema_history`.

## Resultado de la auditoría real

[Resultados verificados y trazabilidad del reporte SQL](resultado-auditoria-staging.md), ejecutado por el usuario con sudo el 21/10/2026 a las 18:07:12 America/Mexico_City (22/10 00:07:12 UTC). SHA-256 del extracto completo conservado localmente, sin prompts: `989ee7ad3378a68014837b1819a92994625559ed961ffff718ebfb9082828015`. Base fija `tramites_pruebas`, `solo_lectura=on`, cierre `ROLLBACK` y mensaje FIN presentes.

| Comprobación | Resultado observado |
| --- | --- |
| Propietarios | 15 tablas, 12 secuencias, 40 índices y una función de tramites pertenecen a `tramites_owner`. Ninguno de los objetos inventariados pertenece a `tramites_migrador`. **No procede ALTER OWNER.** |
| Roles | Owner NOLOGIN; app y migrador sin superusuario/creación de roles/bases/replicación/BYPASSRLS. El migrador hereda owner y tiene SET ROLE permitido. |
| Catálogo V9/V10 | 21 columnas compatibles, 31 restricciones incluidas las NOT NULL de PostgreSQL 18 con convalidated=t; nueve índices con indisvalid=t e indisready=t. |
| Historial | Nueve filas: V1–V6, V8, V9 y V10, todas success=t, installed_by=tramites_owner. Historial en tramites; no existe en public. |
| Checksums | V9 `-956879505` y V10 `-130265834`, ambos coinciden con el código revisado. |
| Aplicación | USAGE sin CREATE en tramites, DML en tablas; secuencias USAGE/SELECT sin UPDATE; sin TRUNCATE, REFERENCES o TRIGGER en las tablas. |
| **Hallazgo de privilegios** | **La aplicación también tiene SELECT/INSERT/UPDATE/DELETE en tramites.flyway_schema_history. Debe retirarse su capacidad de escritura en esa tabla de control.** |
| TLS activo | Diez sesiones de tramites_app desde el contenedor de staging, ssl=t, TLSv1.3 y TLS_AES_256_GCM_SHA384. No había sesiones del migrador; no se certifica el TLS histórico de conexiones cerradas. |
| Datos de pagos | Cero pagos. Los cuatro conteos de posibles incumplimientos de CHECK propuestos dieron cero; esto no sustituye una prueba funcional con datos. |

Corrección propuesta y recuperación: [restringir escritura del historial en staging](correccion-permisos-historial.md). Preparada para revisión, **sin ejecutar**.

## Evidencia disponible y sus límites

- Se leyeron las migraciones reales, `Pago`, `PagoService`, `ComprobanteAlmacen`, `ValidacionPagoRequest`, `PagoRepository`, `TipoCambio`, `TipoCambioRepository`, `TipoCambioService` y `ActualizacionTipoCambioService` en el commit citado.
- No hay diferencias en esas migraciones y módulos entre la rama local anterior y el `develop` actualizado. No se modificó ningún archivo de migración.
- La consulta SSH sin privilegios del 21/10 posterior a 23:50 UTC obtuvo `UP` en `127.0.0.1:8081/actuator/health`. Esto acredita disponibilidad; no prueba propietarios, ACL, índices o integridad completa.
- Al iniciar esta continuación, el reporte de servidor más reciente era `20261021-221050-todo.txt`, anterior al despliegue. Se obtuvo después la nueva auditoría enlazada arriba, que sí comprueba el catálogo posterior.
- La propiedad bajo `tramites_migrador` informada previamente **no se confirma**: el inventario actual muestra `tramites_owner`. No hace falta una reparación de propietarios.
- El PR [#85](https://github.com/ernestosantizo2003/NovaGest/pull/85) continúa abierto y sus cuatro checks figuraban en verde al consultar. El primer commit de este PR (#88) también obtuvo cuatro checks verdes y **625 pruebas Java, cero fallos/errores/omitidas**, en [CI 39697379901](https://github.com/ernestosantizo2003/NovaGest/actions/runs/39697379901). Los commits posteriores tienen sus propios checks.
- Se confirmó por API que `hgfdiuy` tiene permiso `write` (`push=true`, `admin=false`).

## V9: pagos

| Elementos | Contraste con Java y conclusión |
| --- | --- |
| `id BIGINT GENERATED ALWAYS AS IDENTITY` | `Long` con `GenerationType.IDENTITY`; compatible. Verificar secuencia y dueño reales. |
| `tramite_id`, `ciudadano_id`, `creado_por`, `validado_por` | `Long`; cuatro FK: una a `tramite(id)` y tres a `usuario(id)`. Solo `validado_por` admite NULL. Sin borrado en cascada; conserva referencias. |
| `monto NUMERIC(14,2)` y `CHECK >=0` | `BigDecimal`, precisión 14 y escala 2. `PagoService.crear` toma el monto del tipo de trámite. Cero permitido también en SQL. |
| Estado y segregación | `VARCHAR(10)` corresponde a `EnumType.STRING`: PENDIENTE, VALIDADO y RECHAZADO. `ck_pago_segregacion` impide autorresolver. El servicio también lo rechaza con 403. |
| Comprobante | Longitudes 100/64/30 coinciden con JPA; tamaño BIGINT positivo. `ComprobanteAlmacen` detecta PDF/PNG/JPEG por contenido, máximo 5 MiB, nombre UUID y SHA-256 hexadecimal. SQL no garantiza MIME, formato del hash ni máximo de tamaño. |
| Fechas y comentario | TIMESTAMPTZ corresponde a `Instant`; comentario de 500 caracteres coincide con `@Size(max=500)`. Creación/actualización tienen `now()` y callbacks JPA. No hay trigger que mantenga actualizado_en en escrituras SQL externas. |
| Índices | PK y cinco explícitos: dos únicos parciales por trámite para PENDIENTE/VALIDADO, y tres de trámite/ciudadano/estado. Los únicos protegen esas invariantes incluso en concurrencia. No hay índice independiente en creado_por/validado_por; evaluar según consultas y borrados, sin añadirlo por defecto. |

**Observación de integridad:** `ck_pago_resuelto` exige `validado_por` al resolver, pero permite `validado_en=NULL`. `Pago.resolver` siempre pone ambos. Además, el servicio exige comentario no vacío al rechazar y SQL no lo exige. Son candidatos a una V11 tras decidir qué reglas deben defenderse también en la base y comprobar los datos existentes. No se afirma que existan filas inválidas.

**Coherencia adicional de V9:** SQL también permite PENDIENTE con validador/fecha ya informados; la entidad nueva deja ambos nulos. Una V11 puede representar ambos lados de la transición: PENDIENTE implica ambos NULL, resuelto implica ambos no NULL, conservando la segregación existente. `ciudadano_id` se deriva del trámite en el servicio; las FK independientes solo comprueban que usuario y trámite existen, no que ese usuario sea su titular. No se debe imponer creado_por=ciudadano_id: un actor autorizado con alcance total puede registrar un pago para un ciudadano. La auditoría encontró cero pagos; no hay evidencia de incoherencias presentes, y no se propone ningún backfill.

**Observación de concurrencia de la línea base, resuelta en develop por #91:** antes se consultaba PENDIENTE y se escribía sin bloqueo/versionado. Ahora resolver toma PESSIMISTIC_WRITE y comprueba el estado dentro de la misma transacción; las pruebas concurrentes pasan. Los índices únicos por trámite se conservan. La integración no acredita que la imagen de staging incluya el arreglo; véase el seguimiento de #91 arriba.

## V10: tipos de cambio

| Elementos | Contraste con Java y conclusión |
| --- | --- |
| `id`, `fecha`, `moneda` | BIGINT identity/`Long`, DATE/`LocalDate`, INTEGER/`Integer`; compatibles y no nulos. |
| `valor NUMERIC(18,6)` | `BigDecimal(18,6)` en JPA y CHECK positivo; compatible. |
| `fuente VARCHAR(30)`, `creado_en TIMESTAMPTZ` | Coinciden con String de longitud 30 e `Instant`. El servicio usa `BANGUAT`; el callback asigna la fecha. |
| Claves e índices | PK, UNIQUE(fecha,moneda) e índice (moneda,fecha). La unicidad evita duplicados y el índice corresponde a la búsqueda por moneda y última fecha <= solicitada. No necesita FK para moneda si el código externo Banguat es el modelo acordado. |

**Observación de aplicación de la línea base, resuelta en develop por #91:** exists/save/flush se sustituyó por INSERT ... ON CONFLICT (fecha,moneda) DO NOTHING, con pruebas de la colisión. UNIQUE se conserva. La coherencia de la respuesta con valores competidores distintos sigue como escenario a probar; el despliegue en staging no está acreditado. V10 permanece intacta.

### V10 frente a monedas y convenciones

`Moneda` admite once códigos: USD=2, EUR=24, GBP=9, JPY=3, CHF=5, CAD=7, MXN=18, CRC=16, HNL=19, BRL=30 y COP=38. USD se interpreta como quetzales por dólar; EUR/GBP como dólares por unidad; las otras ocho monedas como unidades por dólar. El INTEGER de V10 guarda el código Banguat y NUMERIC(18,6) guarda venta original, sin convertirla a un significado único.

`ProyeccionService` y `ConvencionCotizacion` aplican la dirección correcta según ese mapa: primero GTQ/tipo_USD; después se divide por la cotización de EUR/GBP o se multiplica para unidades por dólar. Usan BigDecimal y HALF_EVEN, seis decimales internos y dos para el resultado monetario. Se revisaron los tests existentes de inversión de convenciones y rechazo de valores no positivos; la suite de CI pasó 625 pruebas.

La clave (fecha,moneda) distingue las once series; el índice (moneda,fecha) sirve para la última cotización <= fecha consultada. La fecha guardada es la del proveedor y puede ser anterior a la solicitada; no se debe imponer igualdad con la fecha de consulta ni rechazar fines de semana. El servicio rechaza consultas futuras, usa hora de Guatemala, marca fallback como estimado y devuelve 503 si no tiene una cotización.

La validación de filas se incorporó parcialmente en #91 y la carrera de inserción tiene manejo idempotente; los bordes de redondeo y respuesta frente a valores distintos siguen señalados arriba. SQL no limita moneda al enum ni fuente a BANGUAT; añadir catálogo/CHECK sigue siendo una decisión de contrato que requeriría V11 y mantenimiento al incorporar monedas. No se consultaron cotizaciones en vivo ni se certifica el catálogo externo vigente.

### Origen de la interpretación sobre propietarios

Se revisaron el [PR #80](https://github.com/ernestosantizo2003/NovaGest/pull/80), su discusión y `deploy/adrian/DESPLIEGUE.md` del commit auditado. El PR identifica FLYWAY_USER como tramites_migrador; el documento muestra default privileges FOR ROLE tramites_migrador y solo contempla SET ROLE al owner como variante entre paréntesis. El [comentario de coordinación del DBA](https://github.com/ernestosantizo2003/NovaGest/pull/80#issuecomment-6327359850) ya aclaraba SET ROLE al owner antes del despliegue.

**Explicación técnica probable, no confirmación de la intención de Adrián:** se tomó el usuario de conexión o el ejemplo documental como creador efectivo. SET ROLE cambia current_user y determina el propietario de nuevos objetos aunque se autentique como migrador ([PostgreSQL](https://www.postgresql.org/docs/18/sql-set-role.html)). La evidencia real muestra owner tanto en relowner como en installed_by. No se encontró en los hilos revisados una declaración de Adrián acompañada de una consulta de catálogo que demuestre propiedad anterior distinta; no se puede atribuirle una causa concreta ni afirmar que alguien haya cambiado propietarios entre medias. Se recomienda alinear la documentación con el modelo efectivamente usado y pedirle identificar la consulta o captura original si se necesita cerrar la discrepancia histórica.

## Propiedad y privilegios: condición de cierre

Modelo acordado: conexión de Flyway como `tramites_migrador`, creación efectiva como `tramites_owner` (NOLOGIN), aplicación como `tramites_app`.
`installed_by=tramites_migrador` no demuestra quién posee las tablas: se necesita `pg_class.relowner` y, para funciones, `pg_proc.proowner`.

La auditoría ya confirma que los propietarios son correctos. Los pasos siguientes son una contingencia documental para una futura divergencia; **no son necesarios ni se autorizan con esta revisión**:

1. Inventariar tabla, secuencia, índice y función de `tramites`; conservar las ACL actuales y preparar respaldo antes de una corrección autorizada.
2. Confirmar la configuración efectiva de `SPRING_FLYWAY_INIT_SQLS=SET ROLE tramites_owner` y su aplicación a las conexiones de migración. La pertenencia al rol por sí sola no cambia el creador efectivo.
3. Preparar ALTER OWNER delimitados a objetos inventariados de esta base/esquema y comprobar las dependencias de secuencias identity. Evitar REASSIGN OWNED general sobre un servidor compartido.
4. Revisar GRANT efectivos de tablas y secuencias: cambiar propietario no aplica retroactivamente los default privileges. Comprobar por separado el historial Flyway; el rol de aplicación no debe poder manipular sus filas.
5. Repetir la auditoría. No borrar, recrear tablas, editar V9/V10 ni ejecutar `flyway repair` para ocultar divergencias.

Los default privileges solo afectan objetos futuros del rol creador efectivo; no se heredan desde roles de pertenencia. Véase [PostgreSQL 18](https://www.postgresql.org/docs/18/sql-alterdefaultprivileges.html).

## Checksums esperados y auditoría

| Versión | CRC32 firmado esperado por Flyway | SHA-256 del blob Git |
| --- | --- | --- |
| V9 | `-956879505` | `37e447bf4f1574836ace14935e4317204f12b8eb94a800b3d92a461339e04468` |
| V10 | `-130265834` | `65652efa5a13083c9b2a9d42f3d7fb55eac1f989270802b4ee7fe96cc416f7c9` |

Se calcularon con CRC32 sobre líneas UTF-8 sin separadores y sin BOM inicial, conforme al [código de Flyway](https://github.com/flyway/flyway/blob/main/flyway-core/src/main/java/org/flywaydb/core/internal/resolver/ChecksumCalculator.java). SHA-256 identifica el contenido del repositorio; no reemplaza el checksum de Flyway. La auditoría real confirma ambos valores esperados. Ante una futura divergencia, investigar el artefacto sin sobrescribir historial.

El [SQL revisable de auditoría](auditoria-staging.sql) (copia local: `server/novagest-dba-staging.sql` en NovaGest-Infra) consulta solo `tramites_pruebas`, con transacción REPEATABLE READ READ ONLY, timeout y ROLLBACK. Obtiene definiciones reales, propietarios, secuencias, privilegios por objeto, historial con checksums, TLS de sesiones activas y conteos agregados de posibles filas incompatibles con V11. No revela registros personales, contraseñas o texto de consultas. SHA-256 del SQL: `ab65ad289b53a978f101227f1b372517b775fb2e06ce2b600e3f6fef4d8dd790`.

El lanzador `server/Invoke-NovaGestDba.ps1` muestra el SQL por defecto. Con `-Ejecutar` copia el SQL al directorio de operaciones del usuario, verifica una copia protegida mediante SHA-256 y solicita sudo en la terminal del usuario. Solo escribe el SQL de trabajo, la copia temporal y el reporte local; PostgreSQL queda en solo lectura. La ausencia de una sesión de migrador tras arrancar es normal y no demuestra ni descarta TLS en una conexión ya cerrada.

## Propuesta V11, sin ejecutar

No se añade ningún archivo a `db/migration`. Tras auditar y obtener autorización:

- Para resueltos, exigir validador y fecha; para rechazados, decidir si exigir comentario no vacío.
- Se dejó una [propuesta SQL de coherencia](propuesta-V11-coherencia-pagos.md) fuera del directorio de migraciones, sin ejecutar.
- Evaluar CHECK de MIME, hash SHA-256 y tamaño máximo conforme a la política de comprobantes vigente.
- Consultar conteos previos; si hay datos incompatibles, definir una corrección explícita preservando datos y trazabilidad. No rellenar fechas o comentarios inventados.
- Preparar respaldo y plan de bloqueo/validación. Si se usa NOT VALID, validar después de subsanar y repetir la auditoría; la restricción no queda cerrada hasta validarse.
- Gestionar propiedad/ACL como cambio operativo específico del entorno (staging y producción tienen nombres de roles distintos). No introducir nombres de roles de staging en una migración compartida sin diseño previo.

## Revisión obligatoria en GitHub

No había CODEOWNERS en las ubicaciones reconocidas de `main` o `develop`. El ruleset activo [24593540](https://github.com/ernestosantizo2003/NovaGest/rules/24593540) incluye ambas ramas, pero solo `deletion` y `non_fast_forward`. La consulta de reglas efectivas devuelve esos dos tipos: no exige PR, aprobaciones, code owners ni status checks. Las consultas de protección clásica dieron 404; esta conclusión se apoya también en las reglas efectivas, no solo en ese error.

Este PR propone `/src/main/resources/db/migration/ @hgfdiuy` y protege el propio CODEOWNERS con `@ernestosantizo2003`. Tener permiso write permite ser code owner, pero no habilita por sí solo la protección. Un administrador debe exigir PR, al menos una aprobación, revisión de code owners, descarte de aprobaciones obsoletas y los checks de CI/seguridad/frontend acordados. Un DBA no puede aprobar su propio PR: si lo autoría, se necesita otro DBA autorizado o un procedimiento de revisión independiente.

La regla debe existir en la rama base del PR; agregarla solo en una rama de propuesta no la activa. Al listar varios code owners en una misma línea, GitHub acepta a cualquiera, por lo que no se añade un no-DBA como alternativa. Véase [documentación de GitHub](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners).

## Dictamen y responsables

**Propuesta de dictamen: cambios requeridos por exceso de permisos sobre el historial Flyway; sin aprobación definitiva para producción.** La revisión estructural y la propiedad/checksums pasan. Debe autorizarse la corrección limitada de ACL, ejecutarse y comprobarse antes del cierre. Los CHECK siguen como decisión de V11; las carreras originales tienen corrección integrada por #91 y los residuales de aplicación quedan descritos arriba, sin despliegue acreditado. No se han aplicado nuevas migraciones.

| Responsable | Siguiente acción |
| --- | --- |
| hgfdiuy / DBA | Revisar el resultado y la propuesta de ACL, autorizar por separado su ejecución y verificar antes del dictamen definitivo. |
| Ernesto / administrador | Revisar CODEOWNERS y activar exigencias del ruleset; el permiso write del DBA no es admin. |
| Adrián | Conservar el modelo SET ROLE que produjo propietarios correctos y mantener Deploy deshabilitado hasta la decisión del equipo. |
| Equipo de aplicación | Conservar los arreglos de #91; resolver/pruebar bordes numéricos y coherencia de cotizaciones, y decidir su despliegue por separado. |

El workflow Deploy figura `disabled_manually`; no se habilitó. El PR #84 de redes sigue abierto y su cierre conserva la autorización pendiente. No se fusionaron PR ni se cambiaron producción, credenciales, redes, firewall o servicios.
