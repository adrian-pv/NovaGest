-- Auditoria DBA de NovaGest: exclusivamente tramites_pruebas; sin datos personales ni secretos.
-- Ejecutar con psql -X -v ON_ERROR_STOP=1 y PGOPTIONS=-c default_transaction_read_only=on.
\set ON_ERROR_STOP on
\pset pager off
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '3s';
SELECT current_database() = 'tramites_pruebas' AS base_correcta \gset
\if :base_correcta
\else
  \echo 'ERROR: solo se permite tramites_pruebas'
  \quit 3
\endif
\echo '=== Contexto y modo de solo lectura ==='
SELECT clock_timestamp() AS fecha_servidor, current_database(), current_user,
       current_setting('transaction_read_only') AS solo_lectura, version();
\echo '=== Roles y pertenencia (sin contrasenas) ==='
SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
FROM pg_roles WHERE rolname IN ('tramites_app','tramites_migrador','tramites_owner') ORDER BY 1;
SELECT pg_get_userbyid(m.member) AS miembro, pg_get_userbyid(m.roleid) AS rol,
       m.admin_option, m.inherit_option, m.set_option
FROM pg_auth_members m
WHERE m.member IN (SELECT oid FROM pg_roles WHERE rolname IN ('tramites_app','tramites_migrador','tramites_owner'))
ORDER BY 1,2;
\echo '=== Esquemas y privilegios efectivos ==='
SELECT n.nspname, pg_get_userbyid(n.nspowner) AS propietario, n.nspacl
FROM pg_namespace n WHERE n.nspname IN ('tramites','public') ORDER BY 1;
SELECT r.rolname, n.nspname, has_schema_privilege(r.oid,n.oid,'USAGE') AS uso,
       has_schema_privilege(r.oid,n.oid,'CREATE') AS crear,
       has_database_privilege(r.oid,current_database(),'CONNECT') AS conectar,
       has_database_privilege(r.oid,current_database(),'CREATE') AS crear_en_base
FROM pg_roles r CROSS JOIN pg_namespace n
WHERE r.rolname IN ('tramites_app','tramites_migrador','tramites_owner')
AND n.nspname IN ('tramites','public') ORDER BY 1,2;
\echo '=== Propietarios y ACL de todos los objetos de tramites ==='
SELECT c.oid::regclass AS objeto, c.relkind, pg_get_userbyid(c.relowner) AS propietario, c.relacl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='tramites' ORDER BY c.relkind,c.relname;
SELECT p.oid::regprocedure AS funcion, pg_get_userbyid(p.proowner) AS propietario, p.proacl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='tramites' ORDER BY 1;
\echo '=== Columnas V9/V10: tipo, nulabilidad, identidad y valor por defecto ==='
SELECT c.relname, a.attnum, a.attname, format_type(a.atttypid,a.atttypmod) AS tipo,
       a.attnotnull, a.attidentity, pg_get_expr(d.adbin,d.adrelid) AS valor_por_defecto
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
WHERE n.nspname='tramites' AND c.relname IN ('pago','tipo_cambio') ORDER BY c.relname,a.attnum;
\echo '=== Restricciones y claves foraneas V9/V10 ==='
SELECT c.conrelid::regclass AS tabla, c.conname, c.contype, c.convalidated,
       pg_get_constraintdef(c.oid,true) AS definicion
FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
WHERE n.nspname='tramites' AND c.conrelid IN (to_regclass('tramites.pago'),to_regclass('tramites.tipo_cambio'))
ORDER BY 1,2;
\echo '=== Indices V9/V10 ==='
SELECT t.relname AS tabla, i.indexrelid::regclass AS indice, i.indisunique,
       i.indisvalid, i.indisready, pg_get_indexdef(i.indexrelid) AS definicion
FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
WHERE n.nspname='tramites' AND t.relname IN ('pago','tipo_cambio') ORDER BY 1,2;
\echo '=== Secuencias: propietario y dependencia de tabla/columna ==='
SELECT s.oid::regclass AS secuencia, pg_get_userbyid(s.relowner) AS propietario,
       t.oid::regclass AS tabla, a.attname AS columna, dep.deptype
FROM pg_class s JOIN pg_namespace n ON n.oid=s.relnamespace
LEFT JOIN pg_depend dep ON dep.classid='pg_class'::regclass AND dep.objid=s.oid
AND dep.refclassid='pg_class'::regclass AND dep.deptype IN ('a','i')
LEFT JOIN pg_class t ON t.oid=dep.refobjid
LEFT JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=dep.refobjsubid
WHERE n.nspname='tramites' AND s.relkind='S' ORDER BY 1;
\echo '=== Privilegios efectivos por tabla, incluido historial Flyway ==='
SELECT r.rolname, c.oid::regclass AS tabla,
       has_table_privilege(r.oid,c.oid,'SELECT') AS sel,
       has_table_privilege(r.oid,c.oid,'INSERT') AS ins,
       has_table_privilege(r.oid,c.oid,'UPDATE') AS upd,
       has_table_privilege(r.oid,c.oid,'DELETE') AS del,
       has_table_privilege(r.oid,c.oid,'TRUNCATE') AS trunc,
       has_table_privilege(r.oid,c.oid,'REFERENCES') AS referencia,
       has_table_privilege(r.oid,c.oid,'TRIGGER') AS disparador
FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE r.rolname IN ('tramites_app','tramites_migrador','tramites_owner')
AND n.nspname='tramites' AND c.relkind IN ('r','p') ORDER BY 1,2;
\echo '=== Privilegios efectivos por secuencia ==='
SELECT r.rolname, c.oid::regclass AS secuencia,
       has_sequence_privilege(r.oid,c.oid,'USAGE') AS uso,
       has_sequence_privilege(r.oid,c.oid,'SELECT') AS sel,
       has_sequence_privilege(r.oid,c.oid,'UPDATE') AS upd
FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE r.rolname IN ('tramites_app','tramites_migrador','tramites_owner')
AND n.nspname='tramites' AND c.relkind='S' ORDER BY 1,2;
\echo '=== Privilegios por defecto relevantes (globales y por esquema) ==='
SELECT pg_get_userbyid(d.defaclrole) AS creador, n.nspname AS esquema,
       d.defaclobjtype, d.defaclacl
FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
WHERE d.defaclrole IN (SELECT oid FROM pg_roles WHERE rolname IN ('tramites_app','tramites_migrador','tramites_owner'))
ORDER BY 1,2,3;
\echo '=== Historial Flyway: ubicacion ==='
SELECT to_regclass('tramites.flyway_schema_history') IS NOT NULL AS hay_historial,
       coalesce(to_regclass('public.flyway_schema_history')::text,'(no existe)') AS historial_en_public \gset
\echo 'Historial en public: ' :historial_en_public
\if :hay_historial
  SELECT installed_rank, version, description, type, script, checksum, installed_by,
         installed_on, execution_time, success FROM tramites.flyway_schema_history ORDER BY installed_rank;
  SELECT e.version, e.esperado, h.checksum AS observado, h.checksum=e.esperado AS coincide, h.success
  FROM (VALUES ('9', -956879505), ('10', -130265834)) e(version,esperado)
  LEFT JOIN tramites.flyway_schema_history h ON h.version=e.version ORDER BY e.version;
\else
  \echo 'PENDIENTE/ERROR: no existe tramites.flyway_schema_history'
\endif
\echo '=== TLS de sesiones activas: no se imprime el texto de consultas ==='
SELECT a.usename, a.application_name, a.client_addr, a.state, s.ssl, s.version AS tls_version,
       s.cipher, count(*) AS sesiones
FROM pg_stat_activity a LEFT JOIN pg_stat_ssl s ON s.pid=a.pid
WHERE a.datname=current_database() AND a.usename IN ('tramites_app','tramites_migrador')
GROUP BY 1,2,3,4,5,6,7 ORDER BY 1,2,3;
\echo '=== Prevalidacion agregada de posibles restricciones V11; no muestra filas ==='
SELECT to_regclass('tramites.pago') IS NOT NULL AS hay_pago \gset
\if :hay_pago
  SELECT count(*) AS pagos,
    count(*) FILTER (WHERE estado<>'PENDIENTE' AND validado_en IS NULL) AS resueltos_sin_fecha,
    count(*) FILTER (WHERE comprobante_tipo NOT IN ('application/pdf','image/png','image/jpeg')) AS mime_no_admitido,
    count(*) FILTER (WHERE comprobante_hash !~ '^[0-9a-f]{64}$') AS hash_no_sha256,
    count(*) FILTER (WHERE estado='RECHAZADO' AND (comentario IS NULL OR btrim(comentario)='')) AS rechazo_sin_comentario
  FROM tramites.pago;
\endif
ROLLBACK;
\echo 'FIN: transaccion de solo lectura cerrada; no se modificaron objetos ni datos'
