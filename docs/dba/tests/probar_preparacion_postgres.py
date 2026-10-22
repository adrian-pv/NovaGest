"""Regresiones reales, solo en un cluster NUEVO y desechable de loopback.

Requiere PG_TEST_BIN, NOVAGEST_TEST_ROOT, BASH_TEST_BIN y OPENSSL_TEST_BIN.
No acepta DSN, credenciales ni servidor existente. Nunca llama scripts root/Docker.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import tempfile
import time

REPO = Path(__file__).resolve().parents[3]
SCRIPTS = REPO / 'docs/dba/scripts'
BIN = Path(os.environ['PG_TEST_BIN']).resolve()
ROOT = Path(os.environ['NOVAGEST_TEST_ROOT']).resolve()
ROOT.mkdir(parents=True, exist_ok=True)
WORK = Path(tempfile.mkdtemp(prefix='regresion-', dir=ROOT))
DATA = WORK / 'data'
FLAGS = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
ENV = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
ENV.update(PGCLIENTENCODING='UTF8', PGCONNECT_TIMEOUT='5', PGPASSFILE=str(WORK/'sin-pgpass'))
RESULTS = []

def run(args, data=None, check=True, env=None):
    p = subprocess.run([str(a) for a in args], input=data, capture_output=True,
                       env=env or ENV, creationflags=FLAGS, timeout=45)
    if check and p.returncode:
        raise RuntimeError(f'{Path(str(args[0])).name}: rc={p.returncode}\n{p.stderr.decode("utf-8", "replace")}')
    return p

def exe(name):
    return BIN / (name + ('.exe' if os.name == 'nt' else ''))

def psql(db='tramites_pruebas', user='novagest_test_admin', ssl='disable'):
    return [exe('psql'), '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d',
            f'host=127.0.0.1 port={PORT} dbname={db} user={user} sslmode={ssl}']

def sql(text, db='tramites_pruebas'):
    return run(psql(db), text.encode()).stdout.decode().strip()

def script(name, expected=0, db='tramites_pruebas'):
    p = run(psql(db), (SCRIPTS/name).read_bytes(), check=False)
    assert p.returncode == expected, (name, expected, p.returncode, p.stdout, p.stderr)
    if expected:
        assert b'OK: guardia de historial' not in p.stdout
    RESULTS.append({'caso': name, 'base': db, 'esperado': expected, 'observado': p.returncode})
    return p

def reset():
    sql('''REVOKE tramites_owner FROM tramites_app;
GRANT tramites_owner TO tramites_migrador WITH INHERIT TRUE, SET TRUE;
REVOKE ALL ON tramites.flyway_schema_history FROM PUBLIC;
REVOKE ALL ON tramites.flyway_schema_history FROM tramites_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON tramites.flyway_schema_history TO tramites_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON tramites.pago TO tramites_app;
UPDATE tramites.flyway_schema_history SET success=true, checksum=CASE version
 WHEN '9' THEN -956879505 WHEN '10' THEN -130265834 ELSE 0 END;
DELETE FROM tramites.flyway_schema_history WHERE version NOT IN ('1','2','3','4','5','6','8','9','10');''')

def no_change_on_failure(setup):
    reset()
    sql(setup)
    before = sql("SELECT relacl::text FROM pg_class WHERE oid='tramites.flyway_schema_history'::regclass")
    script('revocar-historial-staging.sql', 3)
    after = sql("SELECT relacl::text FROM pg_class WHERE oid='tramites.flyway_schema_history'::regclass")
    assert before == after, 'Un fallo debe preservar/revertir la ACL'

with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    PORT = sock.getsockname()[1]

started = False
try:
    version = run([exe('psql'), '--version']).stdout.decode().strip()
    assert re.search(r'\b18\.', version), version
    run([exe('initdb'), '-D', DATA, '-U', 'novagest_test_admin', '--auth=trust', '--encoding=UTF8', '--no-locale'])
    run([os.environ['OPENSSL_TEST_BIN'], 'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
         '-keyout', WORK/'test.key', '-out', WORK/'test.crt', '-subj', '/CN=localhost', '-days', '1'])
    with (DATA/'postgresql.conf').open('a', encoding='utf-8') as f:
        f.write(f"\nlisten_addresses='127.0.0.1'\nport={PORT}\nssl=on\n"
                f"ssl_cert_file='{(WORK/'test.crt').as_posix()}'\n"
                f"ssl_key_file='{(WORK/'test.key').as_posix()}'\n")
    run([exe('pg_ctl'), '-D', DATA, '-l', WORK/'postgres.log', '-w', 'start'])
    started = True
    # Prueba de identidad antes de crear objetos: imposibilita apuntar a un cluster ajeno.
    actual = sql('SHOW data_directory;', 'postgres')
    assert Path(actual).resolve() == DATA.resolve(), 'Cluster ajeno: detener'
    sql('''CREATE ROLE tramites_owner NOLOGIN;
CREATE ROLE tramites_migrador LOGIN;
CREATE ROLE tramites_app LOGIN;
GRANT tramites_owner TO tramites_migrador WITH INHERIT TRUE, SET TRUE;
CREATE DATABASE tramites_pruebas;''', 'postgres')
    sql('''CREATE SCHEMA tramites AUTHORIZATION tramites_owner;
GRANT USAGE ON SCHEMA tramites TO tramites_app;
ALTER DEFAULT PRIVILEGES FOR ROLE tramites_owner IN SCHEMA tramites
 GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO tramites_app;
ALTER DEFAULT PRIVILEGES FOR ROLE tramites_owner IN SCHEMA tramites
 GRANT USAGE,SELECT ON SEQUENCES TO tramites_app;
SET ROLE tramites_owner;
SET search_path=tramites;
CREATE TABLE usuario(id BIGINT PRIMARY KEY);
CREATE TABLE tramite(id BIGINT PRIMARY KEY);
CREATE TABLE flyway_schema_history(installed_rank integer PRIMARY KEY,version varchar(50),
 description varchar(200),type varchar(20),script varchar(1000),checksum integer,
 installed_by varchar(100),installed_on timestamp DEFAULT now(),execution_time integer,success boolean);
INSERT INTO flyway_schema_history(installed_rank,version,description,type,script,checksum,installed_by,execution_time,success)
 SELECT row_number() OVER(),v,'fixture','SQL','fixture',CASE v WHEN '9' THEN -956879505
 WHEN '10' THEN -130265834 ELSE 0 END,'tramites_owner',0,true
 FROM unnest(ARRAY['1','2','3','4','5','6','8','9','10']) v;'''
        + (REPO/'src/main/resources/db/migration/V9__pagos.sql').read_text('utf-8')
        + (REPO/'src/main/resources/db/migration/V10__tipo_cambio.sql').read_text('utf-8'))

    old = run(psql(), b'\\quit 4\n', check=False)
    assert old.returncode == 0, 'Cambió la semántica del cliente: revisar'
    RESULTS.append({'caso': 'regresion original quit 4', 'observado': 0})
    for name in ('revocar-historial-staging.sql', 'guardia-historial-staging.sql',
                 'estado-negocio-staging.sql', 'auditoria-staging.sql'):
        script(name, 3, 'postgres')
    script('guardia-historial-staging.sql', 3)
    before = sql('TABLE tramites.flyway_schema_history')
    script('revocar-historial-staging.sql')
    script('revocar-historial-staging.sql')
    script('guardia-historial-staging.sql')
    script('estado-negocio-staging.sql')
    script('auditoria-staging.sql')
    assert sql('TABLE tramites.flyway_schema_history') == before, 'Historial modificado'

    # Ambos caminos de entrada de psql: stdin es el que usa el helper shell.
    p = run(psql()+['-f', SCRIPTS/'guardia-historial-staging.sql'])
    RESULTS.append({'caso': 'guardia mediante -f', 'observado': p.returncode})
    no_change_on_failure('GRANT tramites_owner TO tramites_app WITH INHERIT TRUE,SET TRUE;')
    no_change_on_failure('GRANT tramites_owner TO tramites_app WITH INHERIT FALSE,SET TRUE;')
    no_change_on_failure('GRANT SELECT ON tramites.flyway_schema_history TO PUBLIC;')
    no_change_on_failure('REVOKE tramites_owner FROM tramites_migrador;')
    no_change_on_failure('ALTER TABLE tramites.flyway_schema_history OWNER TO novagest_test_admin;')
    sql('ALTER TABLE tramites.flyway_schema_history OWNER TO tramites_owner;')

    reset()
    sql('REVOKE ALL ON tramites.flyway_schema_history FROM tramites_app; GRANT UPDATE(success) ON tramites.flyway_schema_history TO tramites_app;')
    script('guardia-historial-staging.sql', 3)
    script('revocar-historial-staging.sql')
    assert sql("SELECT has_any_column_privilege('tramites_app','tramites.flyway_schema_history','SELECT,INSERT,UPDATE,REFERENCES')") == 'f'
    for grant in ('INSERT', 'SELECT', 'DELETE'):
        script('revocar-historial-staging.sql')
        sql(f'GRANT {grant} ON tramites.flyway_schema_history TO tramites_app;')
        script('guardia-historial-staging.sql', 3)
    script('revocar-historial-staging.sql')
    for mutation in ("UPDATE tramites.flyway_schema_history SET checksum=7 WHERE version='9';",
                     "UPDATE tramites.flyway_schema_history SET checksum=7 WHERE version='10';",
                     "UPDATE tramites.flyway_schema_history SET success=false WHERE version='9';",
                     "INSERT INTO tramites.flyway_schema_history(installed_rank,version,success) VALUES(99,'11',true);",
                     'REVOKE tramites_owner FROM tramites_migrador;',
                     'REVOKE SELECT ON tramites.pago FROM tramites_app;'):
        reset()
        script('revocar-historial-staging.sql')
        sql(mutation)
        script('guardia-historial-staging.sql', 3)
    reset()
    script('revocar-historial-staging.sql')

    # Pipeline real de Bash: error de psql/tee impide el mensaje final de éxito.
    bash = os.environ['BASH_TEST_BIN']
    for text, expected, broken_tee in [(b"DO $$BEGIN RAISE EXCEPTION 'fixture'; END$$;",3,False),
                                       (b'SELECT 1;',1,True), (b'SELECT 1;',0,False)]:
        cmd = 'set -euo pipefail\n"$@" 2>&1 | tee ' + ('/directorio-inexistente/guardia.txt' if broken_tee else '/dev/null') + '\necho OK_FINAL\n'
        p = run([bash, '-c', cmd, 'regresion', *psql()], text, check=False)
        assert p.returncode == expected, (p.returncode,p.stdout,p.stderr)
        assert (b'OK_FINAL' in p.stdout) == (expected == 0)
        RESULTS.append({'caso': f'pipeline psql/tee {expected}', 'observado': p.returncode})

    # Copia exacta del bloque SQL de sesiones: TLS real del cluster aislado.
    final = (SCRIPTS/'verificar-staging-final.sh').read_text('utf-8')
    tls = final.split("<<'SQL'\n",1)[1].split('\nSQL\n',1)[0]
    for mode, stamp, expected in [('none','2000-01-01',3),('disable','2000-01-01',3),
                                  ('require','2999-01-01',3),('require','2000-01-01',0)]:
        client = None
        try:
            if mode != 'none':
                client = subprocess.Popen([str(x) for x in psql(user='tramites_app',ssl=mode)]+['-c','SELECT pg_sleep(60);'],
                                          stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,env=ENV,creationflags=FLAGS)
                for _ in range(100):
                    if sql("SELECT count(*) FROM pg_stat_activity WHERE usename='tramites_app'") == '1':
                        break
                    time.sleep(.05)
                else:
                    raise RuntimeError('La conexion de fixture no arranco')
            p = run(psql()+['-v',f'started={stamp}','-v','cip=127.0.0.1'],tls.encode(),check=False)
            assert p.returncode == expected, (mode,stamp,p.returncode,p.stdout,p.stderr)
            RESULTS.append({'caso': f'sesiones {mode} desde {stamp}', 'esperado': expected,'observado':p.returncode})
        finally:
            sql("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename='tramites_app'")
            if client:
                client.wait(timeout=10)

    # Respaldo del fixture: lectura completa sin conexion y rechazo de archivo inválido.
    dump = run([exe('pg_dump'),'-h','127.0.0.1','-p',PORT,'-U','novagest_test_admin',
                '-d','tramites_pruebas','-Fc','-t','tramites.flyway_schema_history']).stdout
    for args,data,expected in [(['--list'],dump,0),(['--file='+os.devnull],dump,0),
                               (['--file='+os.devnull],b'archivo-no-valido',1)]:
        p=run([exe('pg_restore'),*args],data,check=False)
        assert p.returncode==expected
        RESULTS.append({'caso':'pg_restore '+str(args),'esperado':expected,'observado':p.returncode})

    report={'version':version,'loopback':True,'cluster_nuevo':True,'casos':RESULTS,
            'manifest_sha256':hashlib.sha256((SCRIPTS/'SHA256SUMS').read_bytes()).hexdigest(),
            'limite':'SQL real, pipeline y lector de respaldo; no ejecuta helpers root ni rotacion/Docker/staging'}
    (ROOT/'resultado-regresion.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'resultado':'OK','casos':len(RESULTS),'version':version},ensure_ascii=False))
finally:
    if started:
        run([exe('pg_ctl'),'-D',DATA,'-m','fast','-w','stop'])
