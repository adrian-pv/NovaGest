# Propuesta: restringir la escritura del historial Flyway en staging

**Preparada, sin ejecutar. Requiere autorización del usuario antes de modificar PostgreSQL.** No es una migración Flyway ni habilita producción.

Secuencia completa: [plan único de cierre](plan-cierre-staging.md). Paquete de ejecución: [corregir-historial-staging.sh](scripts/corregir-historial-staging.sh); no se ejecutó durante la preparación.

La auditoría del 21/10 18:07 America/Mexico_City encontró `tramites_app` con SELECT/INSERT/UPDATE/DELETE sobre `tramites.flyway_schema_history`. La app no necesita modificar la tabla que acredita las migraciones. Sus permisos sobre tablas de negocio y secuencias están fuera de esta corrección.

Se buscó `flyway_schema_history` en src/main: no hay consultas del código de aplicación a esa tabla. Compose proporciona SPRING_FLYWAY_USER por separado. Por mínimo privilegio se propone retirar **todos los privilegios directos de la app sobre esa única tabla**, incluido SELECT, y conservar acceso mediante el migrador/owner. Si el equipo acredita un consumidor que necesite leer el historial, puede acordarse una variante de SELECT sin escritura; no se presume esa necesidad.

## Antes del cambio autorizado

1. Confirmar ventana sin despliegues y que Deploy continúa deshabilitado.
2. Conservar [la evidencia de ACL previa](resultado-auditoria-staging.md) y una copia local de los GRANT de la tabla. La ACL observada fue `{tramites_owner=arwdDxtm/tramites_owner,tramites_app=arwd/tramites_owner}`.
3. Con el acceso de administración acordado, respaldar la tabla/historial usando pg_dump antes de modificar permisos; verificar código de salida y archivo de respaldo protegido. No poner contraseñas en argumentos ni publicar el respaldo.
4. Volver a consultar propietario y privilegios efectivos para confirmar que no han cambiado desde la auditoría. Si difieren, revisar el plan antes de seguir.
5. Desde el 21/10/2026 Claude es el ejecutor DBA y mantiene esta rama (Codex alcanzó su límite de uso; su trabajo sin confirmar se recuperó íntegro en el commit `fix(dba): recuperar el trabajo sin confirmar de Codex`). Los hallazgos críticos de la revisión independiente (`\quit N` sale con 0, privilegios por columna, conteos rígidos) están incorporados y probados: ver [validación](validacion-preparacion-cierre.md#validacion-21-10-claude). Registrar el manifest vigente antes de ejecutar.

## SQL canónico revisable

El único SQL de aplicación está en [revocar-historial-staging.sql](scripts/revocar-historial-staging.sql); se invoca mediante el helper que respalda primero. No mantener una segunda variante abreviada para ejecución manual. El SQL fija tramites_pruebas, valida owner y capacidad SET del migrador, rechaza USAGE y SET del owner por parte de app, evita cambios si ya está restringido y usa BEGIN, timeouts y REVOKE ALL sobre esa única tabla. Solo COMMIT si desaparecen todos los privilegios efectivos; ante fallo ROLLBACK o cierre de conexión. Una pertenencia NOINHERIT con SET permitido tampoco es aceptable. No reutilizar el SQL de auditoría READ ONLY para aplicar cambios.

Esto conserva todos los permisos del migrador/owner y no cambia otras tablas ni secuencias. No modifica filas, checksums, contraseñas ni propietarios. Si los permisos se heredan por otra vía y la comprobación falla, la transacción se revierte; no se amplía el cambio automáticamente.

## Verificación y recuperación

- Repetir la auditoría existente: la fila de tramites_app sobre flyway_schema_history debe ser `sel=f ins=f upd=f del=f trunc=f referencia=f disparador=f`; las demás tablas/secuencias, propietarios y checksums deben conservar los valores previos.
- Comprobar salud de staging y que las nueve filas del historial continúan success=t. No se necesita una nueva migración para probar los GRANT.
- Antes de COMMIT, la recuperación es ROLLBACK. Si hay un motivo validado para volver al estado anterior tras COMMIT, ejecutar, con autorización, solo `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tramites.flyway_schema_history TO tramites_app;`. Esa reversión restaura el exceso previo y requiere documentar el motivo; no es la configuración de cierre deseada.
- Los default privileges del owner conceden DML a la app en todas las tablas nuevas. Al crear por primera vez el historial de otro entorno podría repetirse el problema. Documentar una excepción explícita en el procedimiento de despliegue; no modificar producción ahora ni quitar DML por defecto a todas las tablas de negocio.

No se preparan ALTER OWNER porque los propietarios ya son correctos. Las propuestas de CHECK de V11 y los cambios de concurrencia son trabajos independientes, sujetos a su propio PR y autorización.

## Procedimiento exacto preparado

Tras autorizar respaldo/REVOKE y copiar/verificar el paquete en root:

```bash
bash corregir-historial-staging.sh --aplicar
```

El script toma el candado existente de staging; crea una carpeta privada de root con umask 077; guarda ACL previa, pg_dump custom de **solo la tabla de historial**, índice legible con pg_restore --list, las nueve filas y una captura agregada de conteos/privilegios de negocio y secuencias. Un índice de respaldo legible no equivale a una restauración ensayada: no se crea otra base para probarlo sin autorización.

Antes del REVOKE también recorre el archivo completo mediante pg_restore --file=/dev/null, sin --dbname ni conexión de restauración. Se descarta el SQL generado y se conservan errores en un archivo privado; cualquier error detiene el script. Se crean y verifican hashes del dump y evidencias previas; al terminar se revalidan y se sellan las evidencias posteriores. Esto comprueba lectura y trazabilidad del respaldo, **no una restauración real ni la integridad semántica completa de una base restaurada**. [Modos de pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html). Este camino aún no se ejecutó: el respaldo real se generará únicamente tras autorización.

Solo después de ese respaldo ejecuta [revocar-historial-staging.sql](scripts/revocar-historial-staging.sql). Si falla antes de COMMIT, la conexión termina y PostgreSQL revierte la transacción. Tras COMMIT no restaura privilegios ni datos automáticamente: cualquier falla posterior deja el estado para investigar, con el respaldo conservado y Deploy pausado.

Después ejecuta la [guardia de solo lectura](scripts/guardia-historial-staging.sql). Verifica ausencia efectiva de todos los permisos de app, capacidad del migrador, nueve versiones/checksums y tres EXPLAIN sin ANALYZE de escritura: cada uno debe ser rechazado con SQLSTATE 42501. No inserta/modifica/borra filas para probar permisos. Lee conteos de pago y tipo_cambio como app. Después compara el historial anterior/posterior y los propietarios y privilegios de negocio/secuencias (filas `permiso|` y `secuencia|` de la captura), que deben ser idénticos. Los conteos (`conteo|`) solo se registran: un alta legítima de la app durante la ventana no detiene el script, que indica en su mensaje final si cambiaron. Cualquier fallo de una comprobación termina con código distinto de cero y sin el mensaje OK; no borrar datos ni restaurar una base para resolver un GRANT.

La recuperación posterior a COMMIT consiste, solo si se justifica y autoriza, en el GRANT acotado del estado anterior indicado arriba. No usar pg_restore como forma de revertir un permiso: el dump queda como respaldo de seguridad; restaurarlo afectaría datos y requeriría otra decisión.

## Evitar regresiones

Compose no ejecuta GRANT por sí mismo y los default privileges no se reaplican a tablas existentes durante un reinicio. El riesgo reaparece si alguien recrea/restaura el historial o aplica GRANT general sobre todas las tablas. No se cambian los defaults de todas las tablas de negocio para resolver esta excepción.

La guardia queda preparada para ejecutarse después del REVOKE, después de la recreación coordinada y en futuros despliegues antes de aceptarlos como sanos. Si reaparecen permisos, devuelve error y el cierre se bloquea. Adrián/Ernesto deben acordar e integrar ese control en su procedimiento de despliegue; **no se afirma que el workflow ya lo ejecute** y no se modificó tramites-ctl ni el servidor durante esta preparación. Toda restauración o GRANT amplio requiere revisar esta excepción. Flyway conserva su usuario separado, con SET ROLE al owner, según Compose y la confirmación actual de Adrián.
