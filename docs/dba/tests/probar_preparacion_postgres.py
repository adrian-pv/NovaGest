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

def posix(path):
    s = Path(path).resolve().as_posix()
    return f'/{s[0].lower()}{s[2:]}' if os.name == 'nt' and s[1:2] == ':' else s

def acl_historial():
    return sql("SELECT relacl::text FROM pg_class WHERE oid='tramites.flyway_schema_history'::regclass")

def corregir(caso, esperado, setup=None, gancho=None):
    """corregir-historial-staging.sh de punta a punta con su texto real. Solo se sustituye el entorno del
    servidor (root, runuser, flock, socket y rutas); gancho = SQL justo despues del REVOKE (actividad
    concurrente o un cambio indebido). Comprueba que el OK final solo aparece cuando todo pasa."""
    reset()
    if setup:
        sql(setup)
    texto = (SCRIPTS/'corregir-historial-staging.sh').read_text('utf-8')
    trabajo = Path(tempfile.mkdtemp(prefix='corregir-', dir=WORK))
    (trabajo/'lock').write_text('')
    for viejo, nuevo in [
            ("[[ $EUID -eq 0 ]] || { echo 'ERROR: requiere sudo autorizado' >&2; exit 1; }\n", ''),
            ('/opt/tramites/staging/.lock', posix(trabajo/'lock')),
            ('mktemp -d /root/novagest-acl.XXXXXXXX', f'mktemp -d {posix(trabajo)}/novagest-acl.XXXXXXXX'),
            ('runuser -u postgres -- ', ''),
            ('-h /var/run/postgresql -p 5432 -U postgres', f'-h 127.0.0.1 -p {PORT} -U novagest_test_admin'),
            ('dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"', f"dir='{posix(SCRIPTS)}'"),
            ('"${PSQL[@]}" <"$dir/revocar-historial-staging.sql"\n',
             '"${PSQL[@]}" <"$dir/revocar-historial-staging.sql"\n${GANCHO:+"${PSQL[@]}" -c "$GANCHO"}\n'),
            ('set -euo pipefail\n', 'set -euo pipefail\nflock() { return 0; }\n')]:
        assert texto.count(viejo) >= 1, viejo
        texto = texto.replace(viejo, nuevo)
    (trabajo/'corregir.sh').write_bytes(texto.encode())
    env = dict(ENV, PATH=str(BIN) + os.pathsep + os.environ['PATH'])
    if gancho:
        env['GANCHO'] = gancho
    p = run([os.environ['BASH_TEST_BIN'], posix(trabajo/'corregir.sh'), '--aplicar'], check=False, env=env)
    salida = p.stdout.decode('utf-8', 'replace')
    ok = 'OK: permisos restringidos' in salida
    assert p.returncode == esperado and ok == (esperado == 0), (caso, p.returncode, salida, p.stderr)
    RESULTS.append({'caso': f'corregir: {caso}', 'esperado': esperado, 'observado': p.returncode, 'ok_impreso': ok})
    return salida, p.stderr.decode('utf-8', 'replace')

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
    # Sin capturar la salida: en Windows postgres hereda las tuberias de pg_ctl y run() esperaria su cierre.
    subprocess.run([str(exe('pg_ctl')), '-D', str(DATA), '-l', str(WORK/'postgres.log'), '-w', 'start'],
                   stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                   env=ENV, creationflags=FLAGS, timeout=60, check=True)
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

    # estado-negocio: un alta de la app solo cambia filas 'conteo'; un cambio de permisos cambia filas 'permiso'.
    def sin_conteos(lineas):
        return [l for l in lineas if not l.startswith('conteo|')]
    reset()
    script('revocar-historial-staging.sql')
    antes = script('estado-negocio-staging.sql').stdout.decode().splitlines()
    assert any(l.startswith('conteo|') for l in antes) and any(l.startswith('permiso|') for l in antes)
    assert any(l.startswith('secuencia|') for l in antes)
    sql('INSERT INTO tramites.usuario VALUES (1);')
    despues = script('estado-negocio-staging.sql').stdout.decode().splitlines()
    assert despues != antes and sin_conteos(despues) == sin_conteos(antes)
    sql('REVOKE SELECT ON tramites.pago FROM tramites_app;')
    assert sin_conteos(script('estado-negocio-staging.sql').stdout.decode().splitlines()) != sin_conteos(antes)
    sql('DELETE FROM tramites.usuario;')
    RESULTS.append({'caso': 'estado-negocio separa conteos de permisos', 'observado': 0})

    # corregir-historial-staging.sh completo: el OK final solo si el REVOKE y todas las comprobaciones pasan.
    salida, _ = corregir('normal', 0)
    assert 'conteos de negocio iguales' in salida and acl_historial() == '{tramites_owner=arwdDxtm/tramites_owner}'
    salida, _ = corregir('alta concurrente de la app', 0, gancho='INSERT INTO tramites.usuario VALUES (77)')
    assert 'conteos de negocio cambiaron' in salida
    sql('DELETE FROM tramites.usuario;')
    # DELETE: la guardia no lo comprueba (si lee pago), asi que lo detecta la comparacion de permisos.
    _, err = corregir('permiso de negocio cambiado', 1, gancho='REVOKE DELETE ON tramites.pago FROM tramites_app')
    assert 'propietarios o permisos de negocio difieren' in err
    for caso, setup in [('PUBLIC conserva SELECT', 'GRANT SELECT ON tramites.flyway_schema_history TO PUBLIC'),
                        ('app puede SET ROLE al dueno', 'GRANT tramites_owner TO tramites_app')]:
        reset(); sql(setup); acl = acl_historial()
        corregir(caso, 3, setup=setup)
        assert acl_historial() == acl, 'El REVOKE fallido debe quedar revertido'
    for caso, gancho in [('privilegio reaparece', 'GRANT INSERT ON tramites.flyway_schema_history TO tramites_app'),
                         ('privilegio de columna', 'GRANT UPDATE (success) ON tramites.flyway_schema_history TO tramites_app'),
                         ('checksum V9 alterado', "UPDATE tramites.flyway_schema_history SET checksum=7 WHERE version='9'")]:
        corregir(caso, 3, gancho=gancho)
    reset()
    script('revocar-historial-staging.sql')

    # Rotacion: rotar-staging-coordinado.sh de punta a punta con su texto real y log_statement=all para
    # detectar fugas al registro. pg_hba como staging: SCRAM en 127.0.0.1 con o sin TLS, asi que exigir
    # TLS depende solo del script.
    import shutil, sys
    with (DATA/'pg_hba.conf').open('r+', encoding='utf-8') as f:
        hba = f.read(); f.seek(0)
        f.write('host tramites_pruebas tramites_migrador,tramites_app 127.0.0.1/32 scram-sha-256\n' + hba)
    def recargar(sentencia, ajuste, valor):
        sql(sentencia + '\nSELECT pg_reload_conf();', 'postgres')
        for _ in range(100):
            if sql(f'SHOW {ajuste};', 'postgres') == valor:
                return
            time.sleep(.05)
        raise RuntimeError(f'{ajuste} no se recargo')
    recargar("ALTER SYSTEM SET log_statement = 'all';", 'log_statement', 'all')
    sql("ALTER ROLE tramites_migrador PASSWORD 'clave-vieja-migrador'; ALTER ROLE tramites_app PASSWORD 'clave-vieja-app';")
    def autentica(rol, clave, ssl='require'):
        return run([exe('psql'), '-X', '-w', '-qAt', '-d', f'host=127.0.0.1 port={PORT} dbname=tramites_pruebas user={rol} sslmode={ssl}',
                    '-c', 'SELECT 1'], check=False, env=dict(ENV, PGPASSWORD=clave)).returncode == 0
    assert autentica('tramites_app', 'clave-vieja-app') and not autentica('tramites_app', 'otra')
    assert autentica('tramites_app', 'clave-vieja-app', 'disable'), 'pg_hba de prueba debe admitir sin TLS, como staging'
    CLAVES = WORK/'claves'
    candado = WORK/'lock-rotacion'; candado.write_text('')
    texto = (SCRIPTS/'rotar-staging-coordinado.sh').read_text('utf-8')
    for viejo, nuevo in [
            ("[[ $EUID -eq 0 ]] || { echo 'ERROR: requiere autorizacion y sudo interactivo' >&2; exit 1; }\n", ''),
            ('psql python3 runuser flock env stat', 'psql flock env stat'),
            ("{ exec 3<>/dev/tty; } 2>/dev/null || { echo 'ERROR: requiere TTY' >&2; exit 1; }", 'exec 3>/dev/null'),
            ('IFS= read -r ack <&3', 'ack=$ACK'),
            ('/opt/tramites/staging/.lock', candado.as_posix()),
            ('sec=/run/novagest-rotacion-staging', f"sec='{CLAVES.as_posix()}'"),
            ('runuser -u postgres -- ', ''),
            ('-h /var/run/postgresql -p 5432 -U postgres', f'-h 127.0.0.1 -p {PORT} -U novagest_test_admin'),
            ('host=127.0.0.1 port=5432', f'host=127.0.0.1 port={PORT}'),
            ('127.0.0.1:5432:tramites_pruebas', f'127.0.0.1:{PORT}:tramites_pruebas'),
            ('python3 -I', f"'{posix(sys.executable)}' -I"),
            ('set -euo pipefail\n', 'set -euo pipefail\nflock() { return 0; }\n')]:
        assert texto.count(viejo) >= 1, viejo
        texto = texto.replace(viejo, nuevo)
    (WORK/'rotar.sh').write_bytes(texto.encode())
    VISTAS = set()
    def claves():
        c = {v: (CLAVES/v).read_text().strip() for v in ('FLYWAY_PASSWORD', 'DB_PASSWORD')}
        VISTAS.update(c.values())
        return c
    def rotar(caso, arg, esperado, ack='ROTAR SOLO STAGING'):
        env = dict(ENV, PATH=str(BIN) + os.pathsep + os.environ['PATH'], ACK=ack)
        p = run([os.environ['BASH_TEST_BIN'], posix(WORK/'rotar.sh'), arg], check=False, env=env)
        salida = p.stdout.decode('utf-8', 'replace') + p.stderr.decode('utf-8', 'replace')
        listo = 'DBA_LISTO' in salida
        assert p.returncode == esperado and listo == (esperado == 0 and arg.startswith('rotar')), (caso, p.returncode, salida)
        assert not (CLAVES/'pgpass').exists(), 'pgpass temporal no retirado'
        if CLAVES.exists():
            assert not any(v in salida for v in claves().values()), 'clave en la salida'
        RESULTS.append({'caso': f'rotar {arg}: {caso}', 'esperado': esperado, 'observado': p.returncode, 'dba_listo': listo})
        return salida
    def vigentes():
        c = claves()
        return autentica('tramites_migrador', c['FLYWAY_PASSWORD']) and autentica('tramites_app', c['DB_PASSWORD'])

    assert 'tmpfs' in rotar('plan', '--plan', 0) and not CLAVES.exists()
    rotar('argumento invalido', 'rotar-todo', 2)
    rotar('frase incorrecta', 'rotar', 2, ack='si')
    assert not CLAVES.exists() and autentica('tramites_app', 'clave-vieja-app')
    rotar('sin directorio de claves', 'comprobar', 1)
    salida = rotar('normal', 'rotar', 0)
    c = claves()
    assert all(re.fullmatch('[0-9a-f]{64}', v) for v in c.values()) and c['FLYWAY_PASSWORD'] != c['DB_PASSWORD']
    assert vigentes()
    assert not autentica('tramites_migrador', 'clave-vieja-migrador') and not autentica('tramites_app', 'clave-vieja-app')
    assert salida.index('OK: tramites_migrador') < salida.index('OK: tramites_app'), 'orden migrador -> app'
    assert sql("SELECT string_agg(left(rolpassword,19),',') FROM pg_authid WHERE rolname IN ('tramites_app','tramites_migrador')") \
        == 'SCRAM-SHA-256$4096:,SCRAM-SHA-256$4096:'
    rotar('directorio de una ventana anterior', 'rotar', 1)
    assert claves() == c and vigentes()
    rotar('claves vigentes', 'comprobar', 0)
    for caso, romper, arreglar in [
            ('app con otra clave', "ALTER ROLE tramites_app PASSWORD 'otra-clave';", None),
            ('app puede SET ROLE al dueno', 'GRANT tramites_owner TO tramites_app;', 'REVOKE tramites_owner FROM tramites_app;'),
            ('migrador sin SET ROLE', 'REVOKE tramites_owner FROM tramites_migrador;',
             'GRANT tramites_owner TO tramites_migrador WITH INHERIT TRUE, SET TRUE;')]:
        sql(romper)
        rotar(caso, 'comprobar', 1)
        if arreglar:
            sql(arreglar)
        else:
            rotar(f'recuperacion tras {caso}', 'rotar-app', 0)
            assert claves()['FLYWAY_PASSWORD'] == c['FLYWAY_PASSWORD'] and claves()['DB_PASSWORD'] != c['DB_PASSWORD'] and vigentes()
        rotar(f'tras corregir {caso}', 'comprobar', 0)
    recargar('ALTER SYSTEM SET ssl = off;', 'ssl', 'off')
    rotar('servidor sin TLS', 'comprobar', 1)
    recargar('ALTER SYSTEM RESET ssl;', 'ssl', 'on')
    # En Git Bash (NTFS montado con noacl) stat muestra 0777 & ~umask: el modo solo se puede probar en Linux.
    if os.name != 'nt':
        CLAVES.chmod(0o755)
        rotar('directorio de claves legible por otros', 'comprobar', 1)
        CLAVES.chmod(0o700)
    # Fallo a mitad: la app cambia de clave pero no puede entrar; DETENIDO sin DBA_LISTO y recuperacion de un rol.
    shutil.rmtree(CLAVES)
    sql('ALTER ROLE tramites_app NOLOGIN;')
    salida = rotar('app sin LOGIN tras su cambio', 'rotar', 1)
    assert 'DETENIDO. Roles cuyo cambio se inicio: tramites_migrador tramites_app' in salida
    sql('ALTER ROLE tramites_app LOGIN;')
    migrador = claves()['FLYWAY_PASSWORD']
    rotar('recuperacion de la app', 'rotar-app', 0)
    assert claves()['FLYWAY_PASSWORD'] == migrador and vigentes()
    registro = (WORK/'postgres.log').read_text('utf-8', 'replace')
    assert 'ALTER ROLE tramites_app PASSWORD' in registro, 'log_statement=all no registra: la prueba no vale'
    assert 'SCRAM-SHA-256$' not in registro and not any(v in registro for v in VISTAS), 'clave o verificador en el log'
    RESULTS.append({'caso': f'log de PostgreSQL sin {len(VISTAS)} claves generadas ni verificadores', 'observado': 0})

    # Carga de Adrian: el bloque real del procedimiento sobre un .env de fixture con las claves vigentes.
    doc = (REPO/'docs/dba/rotacion-staging-coordinada.md').read_bytes().decode('utf-8').replace('\r\n', '\n')
    carga = doc.split('# --- carga de claves', 1)[1].split('\n', 1)[1].split('# --- fin de la carga', 1)[0]
    fx = Path(tempfile.mkdtemp(prefix='staging-', dir=WORK))
    (fx/'snap').mkdir()
    def cargar(caso, env_txt, app_txt='JWT_SECRET=fixture\n', esperado=0):
        (fx/'.env').write_bytes(env_txt.encode()); (fx/'app.env').write_bytes(app_txt.encode())
        cuerpo = carga.replace('/run/novagest-rotacion-staging', CLAVES.as_posix()).replace('/opt/tramites/staging/', fx.as_posix() + '/')
        cmd = f"set -euo pipefail\numask 077\ncd '{fx.as_posix()}'\nrot_snapshot='{(fx/'snap').as_posix()}'\n{cuerpo}echo CARGA_OK\n"
        p = run([os.environ['BASH_TEST_BIN'], '-c', cmd], check=False)
        salida = (p.stdout + p.stderr).decode('utf-8', 'replace')
        assert p.returncode == esperado and ('CARGA_OK' in salida) == (esperado == 0), (caso, p.returncode, salida)
        assert not any(v in salida for v in claves().values()), 'clave en la salida de la carga'
        RESULTS.append({'caso': f'carga de Adrian: {caso}', 'esperado': esperado, 'observado': p.returncode})
        return (fx/'.env').read_bytes().decode()
    base = ('COMPOSE_PROJECT_NAME=novagest-staging\nDB_USER=tramites_app\nDB_PASSWORD=clave-vieja-app\n'
            'FLYWAY_USER=tramites_migrador\nFLYWAY_PASSWORD=clave-vieja-migrador\nAPP_TAG=1b207b6c0443\n')
    c = claves()
    assert cargar('normal', base) == base.replace('=clave-vieja-app', '=' + c['DB_PASSWORD']).replace(
        '=clave-vieja-migrador', '=' + c['FLYWAY_PASSWORD'])
    assert not list(fx.glob('.env.rotacion.*')), 'temporal de .env no retirado'
    for caso, env_txt, app_txt in [('DB_PASSWORD duplicada', base + 'DB_PASSWORD=otra\n', 'JWT_SECRET=fixture\n'),
                                   ('sin FLYWAY_PASSWORD', base.replace('FLYWAY_PASSWORD=clave-vieja-migrador\n', ''), 'JWT_SECRET=fixture\n'),
                                   ('app.env con clave de datasource', base, 'SPRING_DATASOURCE_PASSWORD=x\n')]:
        assert cargar(caso, env_txt, app_txt, esperado=1) == env_txt, '.env debe quedar intacto'

    report={'version':version,'loopback':True,'cluster_nuevo':True,'casos':RESULTS,
            'manifest_sha256':hashlib.sha256((SCRIPTS/'SHA256SUMS').read_bytes()).hexdigest(),
            'limite':'SQL real, pipeline, lector de respaldo, rotacion y carga de Adrian sobre fixture; '
                     'no ejecuta root/runuser/Docker ni toca staging'}
    (ROOT/'resultado-regresion.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'resultado':'OK','casos':len(RESULTS),'version':version},ensure_ascii=False))
finally:
    if started:
        run([exe('pg_ctl'),'-D',DATA,'-m','fast','-w','stop'])
