-- SOLO LECTURA. Evidencia agregada de negocio para comparar antes/despues.
-- Cada fila empieza por su tipo: 'permiso', 'acl', 'acl_columna' y 'secuencia' (deben ser identicos
-- antes y despues) y 'conteo' (filas por tabla: solo evidencia, cambian con actividad legitima de la app).
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
SELECT format('SELECT %L AS tipo, %L AS tabla, count(*) AS filas FROM %I.%I;','conteo',c.relname,n.nspname,c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='tramites' AND c.relkind IN ('r','p') AND c.relname<>'flyway_schema_history'
ORDER BY c.relname \gexec
SELECT 'permiso',c.relname,r.rolname,
  has_table_privilege(r.oid,c.oid,'SELECT'),has_table_privilege(r.oid,c.oid,'INSERT'),
  has_table_privilege(r.oid,c.oid,'UPDATE'),has_table_privilege(r.oid,c.oid,'DELETE'),
  has_table_privilege(r.oid,c.oid,'TRUNCATE'),pg_get_userbyid(c.relowner)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN pg_roles r
WHERE n.nspname='tramites' AND c.relkind IN ('r','p') AND c.relname<>'flyway_schema_history'
AND r.rolname IN ('tramites_app','tramites_migrador') ORDER BY c.relname,r.rolname;
-- Ademas de permisos efectivos app/migrador, comparar ACL completas para todos
-- los beneficiarios y columnas. Un cambio a un tercero o solo REFERENCES/TRIGGER/
-- MAINTAIN no debe quedar oculto por las cinco comprobaciones anteriores.
SELECT 'acl',c.relname,c.relkind,pg_get_userbyid(c.relowner),c.relacl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='tramites' AND c.relname<>'flyway_schema_history'
AND c.relkind IN ('r','p','S','v','m','f','i','I') ORDER BY c.relname;
SELECT 'acl_columna',c.relname,a.attnum,a.attname,a.attacl
FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='tramites' AND c.relname<>'flyway_schema_history'
AND c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped
ORDER BY c.relname,a.attnum;
SELECT 'secuencia',c.relname,r.rolname,has_sequence_privilege(r.oid,c.oid,'USAGE'),
  has_sequence_privilege(r.oid,c.oid,'SELECT'),has_sequence_privilege(r.oid,c.oid,'UPDATE'),
  pg_get_userbyid(c.relowner)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN pg_roles r
WHERE n.nspname='tramites' AND c.relkind='S'
AND r.rolname IN ('tramites_app','tramites_migrador') ORDER BY c.relname,r.rolname;
ROLLBACK;
