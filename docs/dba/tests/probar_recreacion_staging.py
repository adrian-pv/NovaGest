"""Pruebas aisladas de cargar-recrear-staging.sh (carga de claves y recreación única de Adrián).

Corre en Linux sin privilegios: docker y curl son dobles que registran cada llamada, y
/opt/tramites/staging, /run/novagest-rotacion-staging y /root son directorios de fixture.
No usa Docker, PostgreSQL, red ni rutas reales.

Uso: python3 -I docs/dba/tests/probar_recreacion_staging.py [resultado.json]
     RECREAR_SCRIPT=<copia alterada> para comprobar que un mutante hace fallar el arnés.
"""
import grp
import json
import os
import pwd
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

if not sys.platform.startswith('linux'):
    sys.exit('Este arnés necesita Linux (stat, flock y modos reales).')
if os.geteuid() == 0:
    sys.exit('No ejecutar como root: el arnés no necesita privilegios.')

SCRIPT = Path(os.environ.get('RECREAR_SCRIPT') or Path(__file__).resolve().parents[1] / 'scripts' / 'cargar-recrear-staging.sh')
USUARIO = pwd.getpwuid(os.getuid()).pw_name
GRUPO = grp.getgrgid(os.getgid()).gr_name
TAG = '1b207b6c0443'
REF = 'ghcr.io/ernestosantizo2003/novagest:' + TAG
ID = 'sha256:' + 'ab' * 32
OTRO_ID = 'sha256:' + 'cd' * 32
RESPONSABLE = 'EJEMPLO\\adrian'
ENV_BASE = ('COMPOSE_PROJECT_NAME=novagest-staging\nAPP_IMAGE=ghcr.io/ernestosantizo2003/novagest\nAPP_PORT=8081\n'
            'DB_HOST=host.docker.internal\nDB_PORT=5432\nDB_NAME=tramites_pruebas\nDB_USER=tramites_app\n'
            'DB_PASSWORD=clave-vieja-app\nFLYWAY_USER=tramites_migrador\nFLYWAY_PASSWORD=clave-vieja-migrador\n'
            'NET_BRIDGE=br-nova-stg\nNET_SUBNET=172.30.11.0/24\n')
APP_ENV = 'JWT_SECRET=fixture-jwt\n'
TOPOLOGIA = ('novagest-staging_default 3f1c0d9e8b7a\n'
             'volume novagest-staging_comprobantes /var/lib/docker/volumes/novagest-staging_comprobantes/_data /data/comprobantes\n')
RESULTS = []

DOCKER = r'''#!/usr/bin/env bash
set -u
e=$STUB_ESTADO
printf '%s\n' "$*" >>"$e/llamadas"
prohibido() { printf '%s\n' "$*" >>"$e/prohibidos"; exit 9; }
case $1 in
  inspect)
    [[ $2 == -f && $4 == novagest-staging-app-1 ]] || prohibido "$@"
    [[ -f $e/existe ]] || { echo "Error: No such object: $4" >&2; exit 1; }
    case $3 in
      '{{.Config.Image}}') cat "$e/ref" ;;
      '{{.Image}}') cat "$e/imagen" ;;
      '{{.Id}}') cat "$e/cid" ;;
      '{{.State.Status}}') cat "$e/estado" ;;
      *NetworkSettings.Networks*) cat "$e/topologia" ;;
      estado=*) echo "estado=$(cat "$e/estado") reinicios=4 salida=1 imagen=$(cat "$e/imagen")" ;;
      *) prohibido "$@" ;;
    esac ;;
  image)
    [[ $2 == inspect && $3 == -f && $4 == '{{.Id}}' && $5 == "$(cat "$e/ref")" ]] || prohibido "$@"
    cat "$e/imagen_ref" ;;
  network)
    [[ $2 == inspect ]] || prohibido "$@"
    [[ $3 == novagest-staging_default ]] ;;
  compose)
    shift
    [[ -n ${APP_TAG:-} ]] || prohibido "compose sin APP_TAG"
    envf=
    while [[ $1 == --project-directory || $1 == -f || $1 == --env-file ]]; do
      [[ $1 == --env-file ]] && envf=$2
      shift 2
    done
    case "$*" in
      'config --format json')
        python3 -I - "$envf" <<'PY'
import json, os, sys
env = dict(l.rstrip('\n').split('=', 1) for l in open(sys.argv[1]) if '=' in l)
e = os.environ['STUB_ESTADO']
img = open(e + '/config_imagen').read().strip() if os.path.exists(e + '/config_imagen') else env['APP_IMAGE'] + ':' + os.environ['APP_TAG']
db = 'otra-clave' if os.path.exists(e + '/config_sin_clave') else env.get('DB_PASSWORD')
print(json.dumps({'services': {'app': {'image': img, 'environment': {'DB_PASSWORD': db, 'SPRING_FLYWAY_PASSWORD': env.get('FLYWAY_PASSWORD')}}}}))
PY
        ;;
      'up -d --no-deps --no-build --pull never --force-recreate app')
        echo x >>"$e/ups"
        grep -E '^(FLYWAY_PASSWORD|DB_PASSWORD)=' "$envf" | sha256sum >"$e/env_en_up"
        [[ -f $e/up_falla ]] && exit 1
        od -An -N16 -tx1 /dev/urandom | tr -d ' \n' >"$e/cid"
        [[ -f $e/up_cambia_imagen ]] && cat "$e/up_cambia_imagen" >"$e/imagen"
        [[ -f $e/up_cambia_topologia ]] && echo 'otra-red 999' >>"$e/topologia"
        cat "$e/estado_tras_up" >"$e/estado" 2>/dev/null || echo running >"$e/estado"
        ;;
      'logs --no-color --tail 80 app')
        {
          for i in $(seq 1 120); do echo "app-1  | linea $i"; done
          echo "app-1  | FATAL: password authentication failed; DB_PASSWORD=$(grep '^DB_PASSWORD=' "$envf" | cut -d= -f2-)"
          echo "app-1  | spring.flyway.password: $(grep '^FLYWAY_PASSWORD=' "$envf" | cut -d= -f2-)"
          echo "app-1  | eco del valor $(grep '^FLYWAY_PASSWORD=' "$envf" | cut -d= -f2-) en una traza"
          echo 'app-1  | {"password":"hunter2-secreto","token": "tok-secreto"}'
        } | tail -n 80
        ;;
      *) prohibido compose "$@" ;;
    esac ;;
  *) prohibido "$@" ;;
esac
'''

CURL = r'''#!/usr/bin/env bash
e=$STUB_ESTADO
url=${!#}
[[ $url == http://127.0.0.1:8081/actuator/health ]] || { echo "curl $url" >>"$e/prohibidos"; exit 7; }
n=$(( $(cat "$e/curl_n" 2>/dev/null || echo 0) + 1 )); echo "$n" >"$e/curl_n"
case $(cat "$e/salud") in
  up) printf '{"status":"UP","groups":["liveness","readiness"]}' ;;
  down) printf '{"status":"DOWN"}' ;;
  roto) printf '{"status":"UP"' ;;
  texto) printf 'status "UP"' ;;
  tarde) (( n >= 3 )) && printf '{"status":"UP"}' || exit 7 ;;
  *) exit 7 ;;
esac
'''


def preparar(raiz, **op):
    fx = Path(tempfile.mkdtemp(dir=raiz))
    st = fx / 'staging'
    st.mkdir()
    (st / '.env').write_text(op.get('env', ENV_BASE))
    (st / 'app.env').write_text(op.get('app_env', APP_ENV))
    for nombre in ('.env', 'app.env'):
        os.chmod(st / nombre, 0o600)
    (st / 'compose.yaml').write_text('# fixture\n')
    (st / 'current_tag').write_text(TAG + '\n')
    os.chmod(st / 'current_tag', 0o644)
    (st / '.lock').write_text('')
    if op.get('deploy_log', True):
        (st / 'deploy.log').write_text('2026-10-21T23:14:05Z | staging | deploy OK 1b207b6c0443 (antes: ninguna) | adrian-pv\n')
    for nombre in op.get('copias', ['.env.bak-20261021-175120', 'app.env.20261021-215923']):
        (st / nombre).write_text('X=1\n')
        os.chmod(st / nombre, 0o600)
    claves = {'FLYWAY_PASSWORD': secrets.token_hex(32), 'DB_PASSWORD': secrets.token_hex(32)}
    sec = fx / 'tmpfs' / 'novagest-rotacion-staging'
    if op.get('claves', True):
        sec.mkdir(parents=True)
        os.chmod(sec, 0o700)
        for k, v in claves.items():
            (sec / k).write_text(op.get('valor_clave', v) + '\n')
            os.chmod(sec / k, op.get('modo_clave', 0o600))
    (fx / 'privado').mkdir()
    e = fx / 'estado'
    e.mkdir()
    for k, v in {'existe': '', 'ref': REF, 'imagen': ID, 'imagen_ref': op.get('imagen_ref', ID), 'cid': 'c0ffee',
                 'estado': 'running', 'topologia': TOPOLOGIA, 'salud': op.get('salud', 'up')}.items():
        (e / k).write_text(v)
    if not op.get('existe', True):
        (e / 'existe').unlink()
    for marca in ('config_sin_clave', 'up_falla'):
        if op.get(marca):
            (e / marca).write_text('')
    if op.get('config_imagen'):
        (e / 'config_imagen').write_text(op['config_imagen'])
    if op.get('up_cambia_imagen'):
        (e / 'up_cambia_imagen').write_text(OTRO_ID)
    if op.get('up_cambia_topologia'):
        (e / 'up_cambia_topologia').write_text('')
    if op.get('estado_tras_up'):
        (e / 'estado_tras_up').write_text(op['estado_tras_up'])
    b = fx / 'bin'
    b.mkdir()
    for nombre, cuerpo in (('docker', DOCKER), ('curl', CURL)):
        (b / nombre).write_text(cuerpo)
        os.chmod(b / nombre, 0o755)
    if op.get('chown_falla'):
        (b / 'chown').write_text('#!/bin/sh\nexit 1\n')
        os.chmod(b / 'chown', 0o755)
    texto = SCRIPT.read_text()
    for viejo, nuevo in (('dir=/opt/tramites/staging', f"dir='{st}'"),
                         ('sec=/run/novagest-rotacion-staging', f"sec='{sec}'"),
                         ('dueno=deploy:deploy', f"dueno='{USUARIO}:{GRUPO}'"),
                         ('privado=/root/novagest-recreacion', f"privado='{fx}/privado/novagest-recreacion'"),
                         ('espera=180', 'espera=2'), ('intervalo=5', 'intervalo=1'),
                         ('(( EUID == 0 )) ||', 'true ||'), ('flock -w 10 9', 'flock -w 1 9')):
        assert texto.count(viejo) == 1, f'sustitución no aplicable: {viejo}'
        texto = texto.replace(viejo, nuevo)
    codigo = '\n'.join(l for l in texto.splitlines() if not l.lstrip().startswith('#'))
    real = re.search(r'/opt/tramites|/run/novagest|/root/', codigo)
    assert not real, f'quedó una ruta real en la copia de prueba: {real}'
    (fx / 'cargar.sh').write_text(texto)
    return fx, claves


def ejecutar(fx, *args, timeout=60):
    env = {k: v for k, v in os.environ.items() if not k.startswith(('PG', 'DOCKER', 'COMPOSE', 'APP_'))}
    env.update(PATH=f"{fx / 'bin'}:{os.environ['PATH']}", STUB_ESTADO=str(fx / 'estado'), SUDO_USER=RESPONSABLE)
    inicio = time.monotonic()
    p = subprocess.run(['bash', str(fx / 'cargar.sh'), *args], capture_output=True, text=True, env=env, timeout=timeout)
    p.duracion = time.monotonic() - inicio
    return p


def leer(fx, nombre):
    f = fx / 'estado' / nombre
    return f.read_text() if f.exists() else ''


def caso(nombre, p, esperado, *comprobaciones):
    for ok, motivo in comprobaciones:
        assert ok, f'{nombre}: {motivo}\n--- stdout\n{p.stdout}\n--- stderr\n{p.stderr}'
    assert p.returncode == esperado, f'{nombre}: código {p.returncode}, esperado {esperado}\n--- stdout\n{p.stdout}\n--- stderr\n{p.stderr}'
    RESULTS.append({'caso': nombre, 'esperado': esperado, 'observado': p.returncode})


def sin_secretos(fx, p, claves):
    textos = [p.stdout, p.stderr, leer(fx, 'llamadas'), (fx / 'staging' / 'deploy.log').read_text() if (fx / 'staging' / 'deploy.log').exists() else '']
    textos += [f.read_text() for f in (fx / 'privado').rglob('*') if f.is_file()]
    vetados = list(claves.values()) + ['clave-vieja-app', 'clave-vieja-migrador', 'hunter2-secreto', 'tok-secreto']
    return not any(v in t for v in vetados for t in textos), 'apareció una clave o secreto en salida, argumentos, bitácora o captura'


def intacto(fx, env=ENV_BASE):
    st = fx / 'staging'
    return ((st / '.env').read_text() == env and not list(st.glob('.env.rotacion.*'))
            and not leer(fx, 'ups')), '.env debía quedar intacto, sin temporales y sin recreación'


def sin_prohibidos(fx):
    return not leer(fx, 'prohibidos'), 'llamada prohibida: ' + leer(fx, 'prohibidos')


def bitacora(fx):
    return (fx / 'staging' / 'deploy.log').read_text().splitlines()


def main():
    raiz = Path(tempfile.mkdtemp(prefix='novagest-recreacion-prueba.'))
    try:
        # Uso y plan
        fx, _ = preparar(raiz)
        p = ejecutar(fx, '--plan')
        caso('plan', p, 0, ('--force-recreate' in p.stdout and 'ADRIAN_LISTO' in p.stdout, 'plan incompleto'),
             (not leer(fx, 'llamadas'), 'el plan no debe llamar a docker'))
        for args in ([], ['--aplicar'], ['--aplicar', 'sha256:xyz'], ['--aplicar', ID, 'extra'], ['--borrar', ID]):
            p = ejecutar(fx, *args)
            caso(f'uso inválido {args}', p, 2, (not leer(fx, 'llamadas'), 'no debe llamar a docker'))

        # Comprobación de solo lectura
        fx, _ = preparar(raiz, claves=False)
        (fx / 'staging' / '.env.rotacion.viejo').write_text('X=1\n')
        p = ejecutar(fx, '--comprobar', ID)
        caso('comprobar antes de DBA_LISTO', p, 0, ((fx / 'staging' / '.env').read_text() == ENV_BASE, '.env cambió'),
             ('aun no disponibles' in p.stdout and 'COMPROBACION OK' in p.stdout, 'salida de comprobación'),
             ('AVISO: copias de entorno' in p.stdout and '.env.bak-20261021-175120' in p.stdout
              and 'app.env.20261021-215923' in p.stdout, 'no avisó de las copias de entorno'),
             ((fx / 'staging' / '.env.rotacion.viejo').exists() and '.env.rotacion.viejo' in p.stdout, 'comprobar no debe borrar'),
             (not leer(fx, 'ups') and not list((fx / 'privado').iterdir()), 'comprobar no debe recrear ni capturar'),
             sin_prohibidos(fx))
        fx, claves = preparar(raiz)
        p = ejecutar(fx, '--comprobar', ID)
        caso('comprobar con claves', p, 0, ('presentes' in p.stdout and 'Health actual: UP' in p.stdout, 'salida'),
             intacto(fx), sin_secretos(fx, p, claves), sin_prohibidos(fx))
        fx, _ = preparar(raiz, env=ENV_BASE.rstrip('\n'))
        p = ejecutar(fx, '--comprobar', ID)
        caso('comprobar detecta .env sin salto final', p, 1, ('salto de linea' in p.stderr, 'motivo'),
             intacto(fx, ENV_BASE.rstrip('\n')))
        fx, _ = preparar(raiz)
        p = ejecutar(fx, '--comprobar', OTRO_ID)
        caso('comprobar con otro ID de imagen', p, 1, ('el contenedor corre' in p.stderr, 'motivo'), intacto(fx))

        # Aplicación normal
        fx, claves = preparar(raiz)
        p = ejecutar(fx, '--aplicar', ID)
        st = fx / 'staging'
        esperado_env = ENV_BASE.replace('=clave-vieja-app', '=' + claves['DB_PASSWORD']).replace(
            '=clave-vieja-migrador', '=' + claves['FLYWAY_PASSWORD'])
        lineas = bitacora(fx)
        patron = (r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ \| staging \| rotacion-credenciales OK ' + TAG +
                  r' \(imagen ' + re.escape(ID) + r' sin cambios; FLYWAY_PASSWORD y DB_PASSWORD nuevas; health UP\) \| '
                  + re.escape(RESPONSABLE))
        snaps = list((fx / 'privado').iterdir())
        caso('aplicar normal', p, 0,
             ((st / '.env').read_text() == esperado_env, 'solo debían cambiar las dos líneas de clave'),
             (oct((st / '.env').stat().st_mode & 0o777) == '0o600', 'modo de .env'),
             (leer(fx, 'ups') == 'x\n', 'debe haber exactamente una recreación'),
             (leer(fx, 'env_en_up') == subprocess.run(['sha256sum'], input=''.join(
                 l + '\n' for l in esperado_env.splitlines() if l.startswith(('FLYWAY_PASSWORD=', 'DB_PASSWORD='))),
                 capture_output=True, text=True).stdout, 'compose up no vio las claves nuevas'),
             (len(lineas) == 2 and lineas[0].startswith('2026-10-21T23:14:05Z') and re.fullmatch(patron, lineas[1]),
              'bitácora: ' + repr(lineas)),
             ('ADRIAN_LISTO' in p.stdout, 'falta ADRIAN_LISTO'),
             (not list(st.glob('.env.rotacion.*')), 'quedó un temporal'),
             (len(snaps) == 1 and (snaps[0] / 'topologia-despues.txt').exists()
              and (snaps[0] / 'topologia-antes.txt').read_text() == (snaps[0] / 'topologia-despues.txt').read_text()
              and (snaps[0] / 'imagen-id.txt').read_text() == ID + '\n', 'captura privada'),
             (int(leer(fx, 'curl_n') or 0) == 1, 'health debía consultarse tras recrear'),
             sin_secretos(fx, p, claves), sin_prohibidos(fx))

        # Detenciones antes de tocar .env
        for nombre, op, motivo in (
                ('sin claves de la ventana', {'claves': False}, 'esperar DBA_LISTO'),
                ('claves con modo 644', {'modo_clave': 0o644}, 'esperar DBA_LISTO'),
                ('clave con formato inválido', {'valor_clave': 'abc$def'}, 'esperar DBA_LISTO'),
                ('etiqueta movida a otra imagen', {'imagen_ref': OTRO_ID}, 'otra imagen'),
                ('contenedor inexistente', {'existe': False}, 'no existe el contenedor'),
                ('compose con otra imagen', {'config_imagen': 'ghcr.io/x/otra:1'}, 'no usa la imagen'),
                ('DB_PASSWORD duplicada', {'env': ENV_BASE + 'DB_PASSWORD=otra\n'}, 'exactamente una'),
                ('sin FLYWAY_PASSWORD', {'env': ENV_BASE.replace('FLYWAY_PASSWORD=clave-vieja-migrador\n', '')}, 'exactamente una'),
                ('app.env con clave de datasource', {'app_env': APP_ENV + 'SPRING_DATASOURCE_PASSWORD=x\n'}, 'app.env no debe'),
                ('.env sin salto de línea final', {'env': ENV_BASE.rstrip('\n')}, 'salto de linea'),
        ):
            fx, claves = preparar(raiz, **op)
            p = ejecutar(fx, '--aplicar', ID)
            caso(f'detenido: {nombre}', p, 1, (motivo in p.stderr, 'motivo: ' + p.stderr), intacto(fx, op.get('env', ENV_BASE)),
                 sin_secretos(fx, p, claves), sin_prohibidos(fx))

        for nombre, preparar_env in (
                ('.env con modo 644', lambda st: os.chmod(st / '.env', 0o644)),
                ('.env enlace simbólico', lambda st: ((st / 'env-real').write_text(ENV_BASE), (st / '.env').unlink(),
                                                      (st / '.env').symlink_to('env-real'))),
                ('.env con enlace duro', lambda st: os.link(st / '.env', st / 'otro-nombre')),
                ('deploy.log enlace simbólico', lambda st: ((st / 'deploy.log').unlink(), (st / 'deploy.log').symlink_to('/dev/null'))),
        ):
            fx, claves = preparar(raiz)
            preparar_env(fx / 'staging')
            p = ejecutar(fx, '--aplicar', ID)
            caso(f'detenido: {nombre}', p, 1, (p.stderr.startswith('DETENIDO'), 'motivo: ' + p.stderr),
                 ((fx / 'staging' / '.env').read_text() == ENV_BASE and not leer(fx, 'ups'), '.env debía quedar intacto'))

        fx, claves = preparar(raiz)
        bloqueo = subprocess.Popen(['flock', str(fx / 'staging' / '.lock'), 'sleep', '30'])
        try:
            time.sleep(0.5)
            p = ejecutar(fx, '--aplicar', ID)
        finally:
            bloqueo.kill()
            bloqueo.wait()
        caso('detenido: candado ocupado', p, 1, ('candado de staging ocupado' in p.stderr, 'motivo'), intacto(fx))

        # Error inesperado a mitad de la carga: línea informada y temporal retirado
        fx, claves = preparar(raiz, chown_falla=True)
        p = ejecutar(fx, '--aplicar', ID)
        linea = next(i for i, l in enumerate(SCRIPT.read_text().splitlines(), 1) if l.startswith('chown --reference=.env'))
        caso('fallo inesperado en chown', p, 1, (f'FALLO: linea {linea} ' in p.stderr, 'no informó la línea ' + str(linea)),
             ('Temporal .env.rotacion.* retirado' in p.stderr, 'no avisó de la limpieza'), intacto(fx), sin_secretos(fx, p, claves))

        # Temporales de una carga interrumpida: --aplicar los retira y continúa
        fx, claves = preparar(raiz)
        (fx / 'staging' / '.env.rotacion.viejo').write_text('FLYWAY_PASSWORD=resto\n')
        p = ejecutar(fx, '--aplicar', ID)
        caso('aplicar retira temporales previos', p, 0, ('Retirados temporales' in p.stdout, 'aviso'),
             (not list((fx / 'staging').glob('.env.rotacion.*')), 'quedó el temporal'), sin_prohibidos(fx))

        # Tras la carga, compose no entregaría las claves: no se recrea
        fx, claves = preparar(raiz, config_sin_clave=True)
        p = ejecutar(fx, '--aplicar', ID)
        caso('detenido: compose no entrega las claves', p, 1, ('no se recrea' in p.stderr, 'motivo'),
             (not leer(fx, 'ups'), 'no debía recrear'), sin_secretos(fx, p, claves))

        # deploy.log inexistente: se crea con dueño y modo de current_tag
        fx, claves = preparar(raiz, deploy_log=False)
        p = ejecutar(fx, '--aplicar', ID)
        dl = fx / 'staging' / 'deploy.log'
        caso('deploy.log inexistente', p, 0, (dl.exists() and len(bitacora(fx)) == 1 and
                                             oct(dl.stat().st_mode & 0o777) == '0o644', 'bitácora nueva'))

        # Health tardío pero dentro del plazo
        fx, claves = preparar(raiz, salud='tarde')
        p = ejecutar(fx, '--aplicar', ID)
        caso('health UP al tercer intento', p, 0, (leer(fx, 'ups') == 'x\n', 'una sola recreación'))

        # Detenciones después de recrear: código 5, diagnóstico enmascarado, sin segunda recreación
        for nombre, op in (('health DOWN', {'salud': 'down'}), ('health JSON truncado', {'salud': 'roto'}),
                           ('health no JSON', {'salud': 'texto'}), ('sin respuesta', {'salud': 'nada'}),
                           ('contenedor exited', {'estado_tras_up': 'exited', 'salud': 'nada'}),
                           ('imagen distinta tras recrear', {'up_cambia_imagen': True}),
                           ('topología distinta tras recrear', {'up_cambia_topologia': True}),
                           ('compose up falla', {'up_falla': True})):
            fx, claves = preparar(raiz, **op)
            p = ejecutar(fx, '--aplicar', ID)
            snaps = list((fx / 'privado').iterdir())
            diag = (snaps[0] / 'diagnostico.txt').read_text() if snaps and (snaps[0] / 'diagnostico.txt').exists() else ''
            lineas = bitacora(fx)
            comprobaciones = [
                (leer(fx, 'ups') == 'x\n', 'debe haber una sola recreación'),
                (len(lineas) == 2 and ' | staging | rotacion-credenciales FALLÓ ' + TAG in lineas[1]
                 and lineas[1].endswith('| ' + RESPONSABLE), 'bitácora de fallo: ' + repr(lineas)),
                ('ADRIAN_LISTO' not in p.stdout, 'no debe anunciar ADRIAN_LISTO'),
                ('segunda recreacion' in p.stderr, 'falta la advertencia de no reintentar'),
                (diag.count('app-1  |') <= 80 and '[CLAVE-OCULTA]' in diag and '[OCULTO]' in diag, 'diagnóstico sin enmascarar o largo'),
                sin_secretos(fx, p, claves), sin_prohibidos(fx)]
            if op.get('estado_tras_up') == 'exited':
                comprobaciones.append((p.duracion < 2, 'un contenedor exited debe detener la espera de inmediato'))
            caso(f'tras recrear: {nombre}', p, 5, *comprobaciones)

        total = len(RESULTS)
        salida = Path(sys.argv[1]) if len(sys.argv) > 1 else None
        informe = {'script': str(SCRIPT), 'casos': RESULTS, 'total': total,
                   'limite': 'docker, curl y rutas simuladas; no prueba Docker ni la app reales'}
        if salida:
            salida.write_text(json.dumps(informe, ensure_ascii=False, indent=1))
        print(f'{total} casos correctos')
    finally:
        shutil.rmtree(raiz, ignore_errors=True)


if __name__ == '__main__':
    main()
