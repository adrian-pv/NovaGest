-- CAMBIO PREPARADO, NO EJECUTADO. Requiere respaldo y autorizacion explicita.
-- Unico cambio persistente: ACL de tramites.flyway_schema_history para tramites_app.
\set ON_ERROR_STOP on
SELECT current_database()='tramites_pruebas' AS base_correcta \gset
\if :base_correcta
\else
  \quit 3
\endif
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
REVOKE ALL PRIVILEGES ON TABLE tramites.flyway_schema_history FROM tramites_app;
SELECT NOT has_table_privilege('tramites_app','tramites.flyway_schema_history',
  'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') AS retirada_correcta \gset
\if :retirada_correcta
  COMMIT;
\else
  ROLLBACK;
  \quit 4
\endif
