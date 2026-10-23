"""Regresiones de guardia/REVOKE con PostgreSQL 18 NUEVO y desechable.

python probar_historial_set_role.py --pg-bin RUTA_BIN_PG18 [--output resultado.json]
No admite DSN ni claves. Solo loopback/puerto aleatorio, nunca 5432 ni un cluster existente.
Ejecuta los SQL versionados sin sustituir su contenido. Las mutaciones solo prueban
que se reproduce el falso OK anterior; no se escriben sobre los scripts.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', type=Path, required=True)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--bash', default=None)
    args = parser.parse_args()
    scripts = Path(__file__).resolve().parents[1] / 'scripts'
    guard = (scripts / 'guardia-historial-staging.sql').read_bytes()
    revoke = (scripts / 'revocar-historial-staging.sql').read_bytes()
    work = Path(tempfile.mkdtemp(prefix='novagest-set-role-'))
    data = work / 'data'
    env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
    env.update(PGCONNECT_TIMEOUT='3', PGPASSFILE=str(work / 'sin-pgpass'), PGCLIENTENCODING='UTF8')
    flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
    cases = []
    started = False
    completed = False
    bash = args.bash or (str(Path(os.environ.get('ProgramFiles', 'C:/Program Files')) / 'Git/bin/bash.exe')
                         if os.name == 'nt' else shutil.which('bash'))

    def binary(name):
        return str(args.pg_bin / (name + ('.exe' if os.name == 'nt' else '')))

    def run(name, argv=(), stdin=None, expected=0):
        p = subprocess.run([binary(name), *map(str, argv)], input=stdin, capture_output=True,
                           env=env, creationflags=flags, timeout=45)
        if expected is not None and p.returncode != expected:
            raise AssertionError(f'{name}: rc={p.returncode}, esperado={expected}; '
                                 f'diagnostico: {p.stderr.decode("utf-8", "replace")}')
        return p

    def sql(text, db='tramites_pruebas', user='admin_prueba', expected=0):
        return run('psql', ['-XqAtw', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1',
                           '-p', port, '-U', user, '-d', db],
                   text.encode() if isinstance(text, str) else text, expected)

    def check(name, condition):
        if not condition:
            raise AssertionError(name)
        cases.append({'caso': name, 'ok': True})

    def snapshot():
        # Incluye ACL completas (tambien columnas), miembros, datos sinteticos y secuencia.
        return sql("""SELECT jsonb_build_object(
          'relaciones',(SELECT jsonb_agg(to_jsonb(x)) FROM
            (SELECT c.relname,c.relkind,c.relowner,c.relacl FROM pg_class c
             JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='tramites' ORDER BY c.relname)x),
          'columnas',(SELECT jsonb_agg(to_jsonb(x)) FROM
            (SELECT c.relname,a.attnum,a.attacl FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
             JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='tramites'
             AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum)x),
          'roles',(SELECT jsonb_agg(to_jsonb(x)) FROM
            (SELECT roleid,member,admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY roleid,member)x),
          'historial',(SELECT jsonb_agg(to_jsonb(h) ORDER BY installed_rank) FROM tramites.flyway_schema_history h),
          'pago',(SELECT jsonb_agg(to_jsonb(p)) FROM tramites.pago p),
          'tipo_cambio',(SELECT jsonb_agg(to_jsonb(t)) FROM tramites.tipo_cambio t),
          'secuencia',(SELECT jsonb_build_array(last_value,is_called) FROM tramites.negocio_seq))::text;""").stdout

    def reset():
        sql("""REVOKE tramites_owner,lector_alterno,puente FROM tramites_app;
          REVOKE lector_alterno FROM puente;
          GRANT tramites_owner TO tramites_migrador WITH INHERIT TRUE,SET TRUE;
          ALTER TABLE tramites.flyway_schema_history OWNER TO tramites_owner;
          REVOKE ALL ON tramites.flyway_schema_history FROM PUBLIC,tramites_app,lector_alterno,puente;
          REVOKE ALL (version,success) ON tramites.flyway_schema_history FROM PUBLIC,tramites_app,lector_alterno,puente;
          GRANT SELECT,INSERT,UPDATE,DELETE ON tramites.flyway_schema_history TO tramites_app;
          GRANT SELECT ON tramites.pago,tramites.tipo_cambio TO tramites_app;
          DELETE FROM tramites.flyway_schema_history WHERE version='11';
          UPDATE tramites.flyway_schema_history SET success=true,checksum=CASE version
            WHEN '9' THEN -956879505 WHEN '10' THEN -130265834 ELSE 0 END;""")

    def blocked(name, setup, guard_blocked=True):
        reset()
        sql(setup)
        before = snapshot()
        if guard_blocked:
            p = sql(guard, expected=3)
            assert b'OK: guardia de historial' not in p.stdout
        p = sql(revoke, expected=3)
        check(name + ': rc3 y ninguna ACL/dato/membresia modificada',
              snapshot() == before and b'Sin cambios:' not in p.stdout)

    def posix(path):
        value = Path(path).resolve().as_posix()
        return '/' + value[0].lower() + value[2:] if os.name == 'nt' else value

    def wrapper(name, expected, hook=None):
        # El texto del wrapper es real; solo se adapta el entorno root/socket/lock
        # a este fixture local ya identificado. No sudo, servidor, Docker ni /opt.
        copy = Path(tempfile.mkdtemp(prefix='wrapper-', dir=work))
        (copy / 'lock').touch()
        text = (scripts / 'corregir-historial-staging.sh').read_text('utf-8')
        substitutions = [
            ("[[ $EUID -eq 0 ]] || { echo 'ERROR: requiere sudo autorizado' >&2; exit 1; }\n", ''),
            ('/opt/tramites/staging/.lock', posix(copy / 'lock')),
            ('mktemp -d /root/novagest-acl.XXXXXXXX', f'mktemp -d {posix(copy)}/novagest-acl.XXXXXXXX'),
            ('runuser -u postgres -- ', ''),
            ('-h /var/run/postgresql -p 5432 -U postgres', f'-h 127.0.0.1 -p {port} -U admin_prueba'),
            ('dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"', f"dir='{posix(scripts)}'"),
            ('set -euo pipefail\n', 'set -euo pipefail\nflock() { return 0; }\n')]
        for old, new in substitutions:
            assert old in text
            text = text.replace(old, new)
        if hook:
            needle = '"${PSQL[@]}" <"$dir/revocar-historial-staging.sql"\n'
            assert text.count(needle) == 1
            text = text.replace(needle, needle + '"${PSQL[@]}" -c "$GANCHO"\n')
        file = copy / 'corregir.sh'
        file.write_text(text, encoding='utf-8', newline='\n')
        p = subprocess.run([bash, posix(file), '--aplicar'], capture_output=True, timeout=60,
                           env=dict(env, PATH=str(args.pg_bin) + os.pathsep + os.environ['PATH'], GANCHO=hook or ''),
                           creationflags=flags)
        check(name, p.returncode == expected and (b'OK: permisos restringidos' in p.stdout) == (expected == 0))

    try:
        version = run('postgres', ['--version']).stdout.decode().strip()
        check('binarios PostgreSQL 18', version.startswith('postgres (PostgreSQL) 18.'))
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = str(sock.getsockname()[1])
        assert port != '5432'
        run('initdb', ['-D', data, '-U', 'admin_prueba', '--auth=trust', '--encoding=UTF8', '--no-locale'])
        with (data / 'postgresql.conf').open('a', encoding='utf-8') as f:
            f.write(f"\nlisten_addresses='127.0.0.1'\nport={port}\nlog_statement=none\n")
        subprocess.run([binary('pg_ctl'), '-D', str(data), '-l', str(work / 'postgres.log'), '-w', 'start'],
                       stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                       env=env, creationflags=flags, timeout=45, check=True)
        started = True
        check('directorio propio confirmado antes de DDL',
              Path(sql('SHOW data_directory;', db='postgres').stdout.decode().strip()).resolve() == data.resolve())
        sql('CREATE ROLE tramites_owner NOLOGIN; CREATE ROLE tramites_migrador LOGIN; '
            'CREATE ROLE tramites_app LOGIN; CREATE ROLE lector_alterno NOLOGIN; CREATE ROLE puente NOLOGIN; '
            'GRANT tramites_owner TO tramites_migrador;', db='postgres')
        sql('CREATE DATABASE tramites_pruebas OWNER tramites_owner;', db='postgres')
        sql("""SET ROLE tramites_owner; CREATE SCHEMA tramites AUTHORIZATION tramites_owner;
          GRANT USAGE ON SCHEMA tramites TO tramites_app,lector_alterno,puente;
          CREATE TABLE tramites.flyway_schema_history(installed_rank integer PRIMARY KEY,
            version varchar(50),checksum integer,success boolean NOT NULL,
            description varchar(200) DEFAULT 'fixture',type varchar(20) DEFAULT 'SQL',
            script varchar(1000) DEFAULT 'fixture',installed_by varchar(100) DEFAULT 'tramites_owner',
            installed_on timestamp DEFAULT now(),execution_time integer DEFAULT 0);
          INSERT INTO tramites.flyway_schema_history(installed_rank,version,checksum,success) SELECT i,v,CASE v WHEN '9' THEN -956879505
            WHEN '10' THEN -130265834 ELSE 0 END,true FROM
            unnest(ARRAY['1','2','3','4','5','6','8','9','10']) WITH ORDINALITY a(v,i);
          CREATE SEQUENCE tramites.negocio_seq;
          CREATE TABLE tramites.pago(id integer DEFAULT nextval('tramites.negocio_seq'));
          CREATE TABLE tramites.tipo_cambio(id integer);
          INSERT INTO tramites.pago DEFAULT VALUES; INSERT INTO tramites.tipo_cambio VALUES(1);
          GRANT SELECT,INSERT,UPDATE,DELETE ON tramites.pago,tramites.tipo_cambio TO tramites_app;
          GRANT USAGE,SELECT ON SEQUENCE tramites.negocio_seq TO tramites_app;""")

        # Reproduce ambos falsos OK quitando SOLO la deteccion nueva en copias en memoria.
        reset()
        sql('REVOKE ALL ON tramites.flyway_schema_history FROM tramites_app; '
            'GRANT SELECT ON tramites.flyway_schema_history TO lector_alterno; '
            'GRANT lector_alterno TO tramites_app WITH INHERIT FALSE,SET TRUE;')
        check('NOINHERIT oculta acceso que SET permite', sql("SELECT "
              "has_table_privilege('tramites_app','tramites.flyway_schema_history','SELECT'),"
              "pg_has_role('tramites_app','lector_alterno','SET');").stdout.strip() == b'f|t')
        check('conexion app alcanza nueve filas mediante SET real',
              sql('SET ROLE lector_alterno; SELECT count(*) FROM tramites.flyway_schema_history;',
                  user='tramites_app').stdout.strip() == b'9')
        old_guard, replacements = re.subn(rb'  -- Revisar TODOS.*?  AND NOT has_table_privilege',
                                         b'  AND NOT has_table_privilege', guard, flags=re.S)
        assert replacements == 1
        old_revoke, replacements = re.subn(rb'-- No retirar membresias.*?\$rutas\$;\n', b'', revoke, flags=re.S)
        assert replacements == 1
        check('mutante anterior reproduce falso OK de guardia', sql(old_guard).returncode == 0)
        check('mutante anterior reproduce Sin cambios falso de REVOKE', b'Sin cambios:' in sql(old_revoke).stdout)
        check('version corregida rechaza ambos falsos OK',
              sql(guard, expected=3).returncode == 3 and sql(revoke, expected=3).returncode == 3)

        for privilege in ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'):
            blocked('SET alterno con ' + privilege,
                    f'GRANT {privilege} ON tramites.flyway_schema_history TO lector_alterno; '
                    'GRANT lector_alterno TO tramites_app WITH INHERIT FALSE,SET TRUE;')
        for privilege in ('SELECT','INSERT','UPDATE','REFERENCES'):
            blocked('SET alterno solo columna ' + privilege,
                    f'GRANT {privilege}(version) ON tramites.flyway_schema_history TO lector_alterno; '
                    'GRANT lector_alterno TO tramites_app WITH INHERIT FALSE,SET TRUE;')
        blocked('SET indirecto', 'GRANT SELECT ON tramites.flyway_schema_history TO lector_alterno; '
                'GRANT lector_alterno TO puente WITH INHERIT FALSE,SET TRUE; '
                'GRANT puente TO tramites_app WITH INHERIT FALSE,SET TRUE;')
        blocked('SET a puente que hereda acceso',
                'GRANT SELECT ON tramites.flyway_schema_history TO lector_alterno; '
                'GRANT lector_alterno TO puente WITH INHERIT TRUE,SET FALSE; '
                'GRANT puente TO tramites_app WITH INHERIT FALSE,SET TRUE;')
        blocked('acceso heredado sin SET', 'GRANT SELECT ON tramites.flyway_schema_history TO lector_alterno; '
                'GRANT lector_alterno TO tramites_app WITH INHERIT TRUE,SET FALSE;')
        blocked('SET al owner sin herencia', 'GRANT tramites_owner TO tramites_app WITH INHERIT FALSE,SET TRUE;')
        blocked('herencia al owner sin SET', 'GRANT tramites_owner TO tramites_app WITH INHERIT TRUE,SET FALSE;')
        blocked('PUBLIC tabla conserva acceso', 'GRANT SELECT ON tramites.flyway_schema_history TO PUBLIC;')
        blocked('PUBLIC columna conserva acceso', 'GRANT UPDATE(success) ON tramites.flyway_schema_history TO PUBLIC;')
        blocked('migrador pierde SET owner', 'GRANT tramites_owner TO tramites_migrador WITH INHERIT TRUE,SET FALSE;')
        blocked('propietario inesperado', 'ALTER TABLE tramites.flyway_schema_history OWNER TO admin_prueba;', False)

        # Simular en memoria que aparece una ruta entre precondicion y COMMIT.
        # El SQL versionado se mantiene intacto; todo lo inyectado debe revertirse.
        reset()
        before = snapshot()
        hook = (b'REVOKE ALL PRIVILEGES ON TABLE tramites.flyway_schema_history FROM tramites_app;\n')
        assert revoke.count(hook) == 1
        raced = revoke.replace(hook, hook + b'GRANT SELECT ON tramites.flyway_schema_history TO lector_alterno;\n'
                               b'GRANT lector_alterno TO tramites_app WITH INHERIT FALSE,SET TRUE;\n')
        sql(raced, expected=3)
        check('ruta SET posterior a precondicion revierte toda la transaccion', before == snapshot())

        reset()
        before = snapshot()
        check('guardia rechaza exceso directo', sql(guard, expected=3).returncode == 3)
        sql(revoke)
        after = snapshot()
        a, b = json.loads(before), json.loads(after)
        for row in a['relaciones']:
            if row['relname'] == 'flyway_schema_history':
                row['relacl'] = next(r['relacl'] for r in b['relaciones'] if r['relname'] == row['relname'])
        check('REVOKE cambia solo ACL del historial; conserva negocio/secuencia/roles/datos', a == b)
        p = sql(guard)
        check('guardia posterior aprueba y muestra tres rechazos 42501', p.stderr.count(b'(42501)') == 3)
        for privilege, query in [
            ('SELECT', 'SELECT count(*) FROM tramites.flyway_schema_history;'),
            ('INSERT', 'EXPLAIN INSERT INTO tramites.flyway_schema_history(installed_rank,success) SELECT 0,false WHERE false;'),
            ('UPDATE', 'EXPLAIN UPDATE tramites.flyway_schema_history SET success=false WHERE false;'),
            ('DELETE', 'EXPLAIN DELETE FROM tramites.flyway_schema_history WHERE false;')]:
            p = sql('\\set VERBOSITY verbose\n' + query, user='tramites_app', expected=3)
            check('conexion app rechaza ' + privilege + ' con 42501', b'42501' in p.stderr)
        check('app no recupera owner por SET',
              sql('SET ROLE tramites_owner;', user='tramites_app', expected=3).returncode == 3)
        check('conexion migrador SET owner y lectura nuevas funcionan',
              sql('BEGIN READ ONLY; SET LOCAL ROLE tramites_owner; SELECT count(*) FROM '
                  'tramites.flyway_schema_history; ROLLBACK;', user='tramites_migrador').stdout.strip() == b'9')
        sql(revoke)
        check('REVOKE idempotente no altera estado', after == snapshot())
        for name, setup in [
            ('membresia sin INHERIT ni SET', 'GRANT SELECT ON tramites.flyway_schema_history TO lector_alterno; '
             'GRANT lector_alterno TO tramites_app WITH INHERIT FALSE,SET FALSE;'),
            ('SET limitado a negocio', 'GRANT SELECT ON tramites.pago TO lector_alterno; '
             'GRANT lector_alterno TO tramites_app WITH INHERIT FALSE,SET TRUE;')]:
            reset(); sql(setup); sql(revoke); sql(guard)
            check(name + ' no causa falso bloqueo', True)

        for mutation in ["UPDATE tramites.flyway_schema_history SET checksum=7 WHERE version='9';",
                         "UPDATE tramites.flyway_schema_history SET checksum=7 WHERE version='10';",
                         "UPDATE tramites.flyway_schema_history SET success=false WHERE version='9';",
                         "INSERT INTO tramites.flyway_schema_history(installed_rank,version,checksum,success) VALUES(99,'11',0,true);",
                         'REVOKE SELECT ON tramites.pago FROM tramites_app;']:
            reset(); sql(revoke); sql(mutation)
            p = sql(guard, expected=3)
            check('guardia falla con ' + mutation.split(';')[0], b'OK: guardia de historial' not in p.stdout)
        reset()
        for name, content in [('guardia', guard), ('REVOKE', revoke)]:
            before = snapshot()
            sql(content, db='postgres', expected=3)
            check(name + ' rechaza otra base sin cambios', before == snapshot())
        reset()
        sql('GRANT SELECT ON tramites.flyway_schema_history TO lector_alterno; '
            'GRANT lector_alterno TO tramites_app WITH INHERIT FALSE,SET TRUE;')
        before = snapshot()
        wrapper('wrapper real aborta SET alterno rc3 sin anunciar OK', 3)
        check('wrapper bloqueado no modifica ACL ni datos', before == snapshot())
        reset()
        wrapper('wrapper real aplica solo REVOKE y termina con OK', 0)
        sql(guard)
        for name, hook in [
            ('tercero recibe REFERENCES en negocio', 'GRANT REFERENCES ON tramites.pago TO lector_alterno'),
            ('tercero recibe permiso solo columna', 'GRANT UPDATE(id) ON tramites.tipo_cambio TO lector_alterno')]:
            reset()
            wrapper('wrapper detecta cambio ajeno: ' + name, 1, hook)
        completed = True
    finally:
        if started:
            run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'])
        result = {'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  'completado': completed, 'total': len(cases), 'casos': cases,
                  'version': locals().get('version'), 'solo_sintetico': True,
                  'cluster_detenido': not (data / 'postmaster.pid').exists(), 'work': str(work),
                  'sha256': {name: hashlib.sha256((scripts / name).read_bytes()).hexdigest()
                             for name in ('guardia-historial-staging.sql', 'revocar-historial-staging.sql')}}
        if args.output:
            args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
