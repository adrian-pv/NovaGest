-- CAMBIO PREPARADO, NO EJECUTADO. Requiere respaldo y autorizacion explicita.
-- Unico cambio persistente: ACL de tramites.flyway_schema_history para tramites_app.
\set ON_ERROR_STOP on
-- psql ignora el numero de \quit (sale con 0): cada fallo termina con RAISE EXCEPTION, que con
-- ON_ERROR_STOP hace salir a psql con 3 y revierte la transaccion abierta.
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
-- No retirar membresias ni permisos de terceros fuera de la autorizacion limitada.
-- Un rol NOINHERIT diferente de owner tambien puede dar acceso mediante SET ROLE.
DO $rutas$
BEGIN
  IF EXISTS(SELECT FROM pg_roles r
    WHERE r.oid <> 'tramites_app'::regrole
      AND pg_has_role('tramites_app',r.oid,'SET')
      AND (has_table_privilege(r.oid,'tramites.flyway_schema_history',
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
        OR has_any_column_privilege(r.oid,'tramites.flyway_schema_history',
        'SELECT,INSERT,UPDATE,REFERENCES'))) THEN
    RAISE EXCEPTION 'FALLO: app puede SET ROLE a otro rol con acceso al historial; requiere revision DBA, sin cambios';
  END IF;
END
$rutas$;
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
-- Volver a exigir ausencia de rutas SET antes de COMMIT; no basta la precondicion.
SELECT NOT EXISTS(SELECT FROM pg_roles r
    WHERE r.oid <> 'tramites_app'::regrole
      AND pg_has_role('tramites_app',r.oid,'SET')
      AND (has_table_privilege(r.oid,'tramites.flyway_schema_history',
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
        OR has_any_column_privilege(r.oid,'tramites.flyway_schema_history',
        'SELECT,INSERT,UPDATE,REFERENCES')))
  AND NOT has_table_privilege('tramites_app','tramites.flyway_schema_history',
  'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
  AND NOT has_any_column_privilege('tramites_app','tramites.flyway_schema_history',
  'SELECT,INSERT,UPDATE,REFERENCES') AS retirada_correcta \gset
\if :retirada_correcta
  COMMIT;
\else
  ROLLBACK;
  DO $f$BEGIN RAISE EXCEPTION 'FALLO: tramites_app conserva privilegios; REVOKE revertido'; END$f$;
\endif
