# Propuesta: restringir la escritura del historial Flyway en staging

**Preparada, sin ejecutar. Requiere autorización del usuario antes de modificar PostgreSQL.** No es una migración Flyway ni habilita producción.

La auditoría del 21/10 18:07 America/Mexico_City encontró `tramites_app` con SELECT/INSERT/UPDATE/DELETE sobre `tramites.flyway_schema_history`. La app no necesita modificar la tabla que acredita las migraciones. Sus permisos sobre tablas de negocio y secuencias están fuera de esta corrección.

Se buscó `flyway_schema_history` en src/main: no hay consultas del código de aplicación a esa tabla. Compose proporciona SPRING_FLYWAY_USER por separado. Por mínimo privilegio se propone retirar **todos los privilegios directos de la app sobre esa única tabla**, incluido SELECT, y conservar acceso mediante el migrador/owner. Si el equipo acredita un consumidor que necesite leer el historial, puede acordarse una variante de SELECT sin escritura; no se presume esa necesidad.

## Antes del cambio autorizado

1. Confirmar ventana sin despliegues y que Deploy continúa deshabilitado.
2. Conservar [la evidencia de ACL previa](resultado-auditoria-staging.md) y una copia local de los GRANT de la tabla. La ACL observada fue `{tramites_owner=arwdDxtm/tramites_owner,tramites_app=arwd/tramites_owner}`.
3. Con el acceso de administración acordado, respaldar la tabla/historial usando pg_dump antes de modificar permisos; verificar código de salida y archivo de respaldo protegido. No poner contraseñas en argumentos ni publicar el respaldo.
4. Volver a consultar propietario y privilegios efectivos para confirmar que no han cambiado desde la auditoría. Si difieren, revisar el plan antes de seguir.

## SQL propuesto para una sesión psql de administración

Solo se ejecutaría conectado a `tramites_pruebas`. El script de auditoría actual es READ ONLY y **no debe reutilizarse para aplicar este cambio**.

```sql
\set ON_ERROR_STOP on
SELECT current_database() = 'tramites_pruebas' AS base_correcta \gset
\if :base_correcta
\else
  \quit 3
\endif
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
REVOKE ALL PRIVILEGES ON TABLE tramites.flyway_schema_history FROM tramites_app;
SELECT NOT has_table_privilege('tramites_app','tramites.flyway_schema_history','SELECT')
   AND NOT has_table_privilege('tramites_app','tramites.flyway_schema_history','INSERT')
   AND NOT has_table_privilege('tramites_app','tramites.flyway_schema_history','UPDATE')
   AND NOT has_table_privilege('tramites_app','tramites.flyway_schema_history','DELETE')
   AND NOT has_table_privilege('tramites_app','tramites.flyway_schema_history','TRUNCATE')
   AND NOT has_table_privilege('tramites_app','tramites.flyway_schema_history','REFERENCES')
   AND NOT has_table_privilege('tramites_app','tramites.flyway_schema_history','TRIGGER')
   AND NOT has_table_privilege('tramites_app','tramites.flyway_schema_history','MAINTAIN')
   AS permisos_correctos \gset
\if :permisos_correctos
  COMMIT;
\else
  ROLLBACK;
  \quit 4
\endif
```

Esto conserva todos los permisos del migrador/owner y no cambia otras tablas ni secuencias. No modifica filas, checksums, contraseñas ni propietarios. Si los permisos se heredan por otra vía y la comprobación falla, la transacción se revierte; no se amplía el cambio automáticamente.

## Verificación y recuperación

- Repetir la auditoría existente: la fila de tramites_app sobre flyway_schema_history debe ser `sel=f ins=f upd=f del=f trunc=f referencia=f disparador=f`; las demás tablas/secuencias, propietarios y checksums deben conservar los valores previos.
- Comprobar salud de staging y que las nueve filas del historial continúan success=t. No se necesita una nueva migración para probar los GRANT.
- Antes de COMMIT, la recuperación es ROLLBACK. Si hay un motivo validado para volver al estado anterior tras COMMIT, ejecutar, con autorización, solo `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tramites.flyway_schema_history TO tramites_app;`. Esa reversión restaura el exceso previo y requiere documentar el motivo; no es la configuración de cierre deseada.
- Los default privileges del owner conceden DML a la app en todas las tablas nuevas. Al crear por primera vez el historial de otro entorno podría repetirse el problema. Documentar una excepción explícita en el procedimiento de despliegue; no modificar producción ahora ni quitar DML por defecto a todas las tablas de negocio.

No se preparan ALTER OWNER porque los propietarios ya son correctos. Las propuestas de CHECK de V11 y los cambios de concurrencia son trabajos independientes, sujetos a su propio PR y autorización.
