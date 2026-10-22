-- CAMBIO PREPARADO, NO EJECUTADO. Requiere respaldo y autorizacion explicita.
-- Unico cambio persistente: ACL de tramites.flyway_schema_history para tramites_app.
\set ON_ERROR_STOP on
SELECT current_database()='tramites_pruebas' AS base_correcta \gset
\if :base_correcta
\else
  DO $f$BEGIN RAISE EXCEPTION 'FALLO: solo se permite tramites_pruebas'; END$f$;
\endif
SELECT EXISTS(SELECT FROM pg_class c WHERE c.oid=to_regclass('tramites.flyway_schema_history')
  AND pg_get_userbyid(c.relowner)='tramites_owner')
  AND pg_has_role('tramites_migrador','tramites_owner','SET')
  AND NOT pg_has_role('tramites_app','tramites_owner','USAGE')
  AND NOT pg_has_role('tramites_app','tramites_owner','SET') AS modelo_esperado \gset
\if :modelo_esperado
\else
  \echo 'FALLO: propietario o pertenencia de roles cambio; no se ejecuta REVOKE'
  DO $f$BEGIN RAISE EXCEPTION 'FALLO: propietario o pertenencia de roles cambio; no se ejecuta REVOKE'; END$f$;
\endif
SELECT NOT has_table_privilege('tramites_app','tramites.flyway_schema_history',
  'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
  AND NOT has_any_column_privilege('tramites_app','tramites.flyway_schema_history',
  'SELECT,INSERT,UPDATE,REFERENCES') AS ya_restringido \gset
\if :ya_restringido
  \echo 'Sin cambios: app ya no tiene privilegios directos/efectivos sobre el historial'
  \quit
\endif
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
REVOKE ALL PRIVILEGES ON TABLE tramites.flyway_schema_history FROM tramites_app;
SELECT NOT has_table_privilege('tramites_app','tramites.flyway_schema_history',
  'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
  AND NOT has_any_column_privilege('tramites_app','tramites.flyway_schema_history',
  'SELECT,INSERT,UPDATE,REFERENCES') AS retirada_correcta \gset
\if :retirada_correcta
  COMMIT;
\else
  ROLLBACK;
  DO $f$BEGIN RAISE EXCEPTION 'FALLO: tramites_app conserva privilegios; REVOKE revertido'; END$f$;
\endif
