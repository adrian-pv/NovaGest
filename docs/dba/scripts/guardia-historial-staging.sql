-- SOLO LECTURA. Guardia posterior a REVOKE y despues de cada recreacion/despliegue.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL statement_timeout='30s';
SELECT current_database()='tramites_pruebas' AS base_correcta \gset
\if :base_correcta
\else
  DO $f$BEGIN RAISE EXCEPTION 'FALLO: solo se permite tramites_pruebas'; END$f$;
\endif
-- NOINHERIT puede ocultar privilegios disponibles mediante SET ROLE.
SELECT NOT pg_has_role('tramites_app','tramites_owner','USAGE')
  AND NOT pg_has_role('tramites_app','tramites_owner','SET')
  -- Revisar TODOS los roles alcanzables con SET, aunque no herede sus permisos.
  AND NOT EXISTS(SELECT FROM pg_roles r
    WHERE r.oid <> 'tramites_app'::regrole
      AND pg_has_role('tramites_app',r.oid,'SET')
      AND (has_table_privilege(r.oid,'tramites.flyway_schema_history',
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
        OR has_any_column_privilege(r.oid,'tramites.flyway_schema_history',
        'SELECT,INSERT,UPDATE,REFERENCES')))
  AND NOT has_table_privilege('tramites_app','tramites.flyway_schema_history',
  'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
  AND NOT has_any_column_privilege('tramites_app','tramites.flyway_schema_history',
  'SELECT,INSERT,UPDATE,REFERENCES') AS app_sin_acceso,
  has_table_privilege('tramites_migrador','tramites.flyway_schema_history',
  'SELECT') AND has_table_privilege('tramites_migrador','tramites.flyway_schema_history','INSERT')
  AND pg_has_role('tramites_migrador','tramites_owner','SET') AS migrador_correcto,
  (SELECT count(*)=9 AND bool_and(success) AND count(DISTINCT version)=9
   AND array_agg(version ORDER BY version)=ARRAY['1','10','2','3','4','5','6','8','9']::varchar[]
   FROM tramites.flyway_schema_history) AS historial_correcto,
  EXISTS(SELECT FROM tramites.flyway_schema_history WHERE version='9' AND checksum=-956879505 AND success)
  AND EXISTS(SELECT FROM tramites.flyway_schema_history WHERE version='10' AND checksum=-130265834 AND success)
  AS checksums_correctos \gset
\if :app_sin_acceso
\else
  \echo 'FALLO: tramites_app conserva privilegios en el historial'
  DO $f$BEGIN RAISE EXCEPTION 'FALLO: tramites_app conserva privilegios en el historial'; END$f$;
\endif
\if :migrador_correcto
\else
  DO $f$BEGIN RAISE EXCEPTION 'FALLO: migrador sin acceso o SET ROLE'; END$f$;
\endif
\if :historial_correcto
\else
  DO $f$BEGIN RAISE EXCEPTION 'FALLO: historial distinto de las nueve versiones exitosas'; END$f$;
\endif
\if :checksums_correctos
\else
  DO $f$BEGIN RAISE EXCEPTION 'FALLO: checksums V9/V10 distintos'; END$f$;
\endif
-- EXPLAIN sin ANALYZE exige privilegios pero no ejecuta INSERT/UPDATE/DELETE.
SET LOCAL ROLE tramites_app;
DO $guardia$
BEGIN
  BEGIN
    EXECUTE 'EXPLAIN INSERT INTO tramites.flyway_schema_history (installed_rank,success) SELECT 0,false WHERE false';
    RAISE EXCEPTION 'FALLO: INSERT no fue rechazado';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK: INSERT rechazado (42501)'; END;
  BEGIN
    EXECUTE 'EXPLAIN UPDATE tramites.flyway_schema_history SET success=false WHERE false';
    RAISE EXCEPTION 'FALLO: UPDATE no fue rechazado';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK: UPDATE rechazado (42501)'; END;
  BEGIN
    EXECUTE 'EXPLAIN DELETE FROM tramites.flyway_schema_history WHERE false';
    RAISE EXCEPTION 'FALLO: DELETE no fue rechazado';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK: DELETE rechazado (42501)'; END;
END
$guardia$;
-- Prueba positiva de lectura de negocio, sin mostrar datos personales.
SELECT count(*) AS pagos_legibles FROM tramites.pago;
SELECT count(*) AS cotizaciones_legibles FROM tramites.tipo_cambio;
RESET ROLE;
ROLLBACK;
\echo 'OK: guardia de historial y lecturas de negocio; sin cambios de datos'
