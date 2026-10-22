-- SOLO LECTURA. Evidencia agregada de negocio para comparar antes/despues.
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='30s';
SELECT current_database()='tramites_pruebas' AS base_correcta \gset
\if :base_correcta
\else
  DO $f$BEGIN RAISE EXCEPTION 'FALLO: solo se permite tramites_pruebas'; END$f$;
\endif
SELECT format('SELECT %L AS tabla, count(*) AS filas FROM %I.%I;',c.relname,n.nspname,c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='tramites' AND c.relkind IN ('r','p') AND c.relname<>'flyway_schema_history'
ORDER BY c.relname \gexec
SELECT c.relname,r.rolname,
  has_table_privilege(r.oid,c.oid,'SELECT'),has_table_privilege(r.oid,c.oid,'INSERT'),
  has_table_privilege(r.oid,c.oid,'UPDATE'),has_table_privilege(r.oid,c.oid,'DELETE'),
  has_table_privilege(r.oid,c.oid,'TRUNCATE'),pg_get_userbyid(c.relowner)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN pg_roles r
WHERE n.nspname='tramites' AND c.relkind IN ('r','p') AND c.relname<>'flyway_schema_history'
AND r.rolname IN ('tramites_app','tramites_migrador') ORDER BY c.relname,r.rolname;
SELECT c.relname,r.rolname,has_sequence_privilege(r.oid,c.oid,'USAGE'),
  has_sequence_privilege(r.oid,c.oid,'SELECT'),has_sequence_privilege(r.oid,c.oid,'UPDATE'),
  pg_get_userbyid(c.relowner)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN pg_roles r
WHERE n.nspname='tramites' AND c.relkind='S'
AND r.rolname IN ('tramites_app','tramites_migrador') ORDER BY c.relname,r.rolname;
ROLLBACK;
