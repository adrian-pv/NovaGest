"""Regresion de logging y guardia, solo PG18 efimero de loopback. Sin claves reales.

python probar_logging_rotacion.py --pg-bin RUTA_BIN_PG18 [--bash RUTA_GIT_BASH]
No se conecta a 5432, no llama al script de rotacion ni modifica servidores existentes.
"""
from pathlib import Path
import argparse, json, os, re, shutil, socket, subprocess, tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', type=Path, required=True)
    parser.add_argument('--bash', default=None)
    args = parser.parse_args()
    binary = lambda name: str(args.pg_bin/(name + ('.exe' if os.name == 'nt' else '')))
    bash = args.bash or (str(Path(os.environ.get('ProgramFiles', 'C:/Program Files'))/'Git/bin/bash.exe') if os.name=='nt' else shutil.which('bash'))
    script = Path(__file__).resolve().parents[1]/'scripts/rotar-staging-coordinado.sh'
    text = script.read_text('utf-8')
    opts = re.search(r"PGOPTIONS='([^']+)'", text)[1]
    query = re.search(r"<<'SQL_LOG_GUARD'\n(.*?)\nSQL_LOG_GUARD", text, re.S)[1]
    guard = text[text.index('if ! logging_seguro='):text.index('for rol in "${roles[@]}"; do', text.index('if ! logging_seguro='))]
    work = Path(tempfile.mkdtemp(prefix='novagest-logging-'))
    env = {k:v for k,v in os.environ.items() if not k.startswith('PG')}
    env.update(PGCONNECT_TIMEOUT='3', PGPASSFILE=str(work/'sin-pgpass'), PGCLIENTENCODING='UTF8')
    flags = subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0
    cases = []; started = False

    def run(name, argv=(), data=None, options=None, ok=True):
        e = env.copy()
        if options is not None:
            e['PGOPTIONS'] = options
        p = subprocess.run([binary(name), *map(str, argv)], input=data, capture_output=True,
                           env=e, creationflags=flags, timeout=45)
        if ok and p.returncode:
            raise RuntimeError(name + ' rc=' + str(p.returncode) + '; diagnostico privado en ' + str(work))
        return p

    def check(name, condition):
        if not condition:
            raise AssertionError(name)
        cases.append({'caso':name, 'ok':True})

    try:
        check('binarios PG18 requeridos', run('postgres',['--version']).stdout.startswith(b'postgres (PostgreSQL) 18.'))
        with socket.socket() as sock:
            sock.bind(('127.0.0.1',0)); port=sock.getsockname()[1]
        assert port != 5432
        run('initdb',['-D',work/'data','-U','admin_prueba','--auth=trust','--encoding=UTF8','--no-locale'])
        with (work/'data/postgresql.conf').open('a', encoding='utf-8') as f:
            f.write(f"\nlisten_addresses='127.0.0.1'\nport={port}\nlog_statement=all\nlog_min_error_statement=error\nlog_min_duration_statement=-1\nlog_min_duration_sample=0\nlog_transaction_sample_rate=1\nlog_statement_sample_rate=1\n")
        subprocess.run([binary('pg_ctl'),'-D',str(work/'data'),'-l',str(work/'pg.log'),'-w','start'],
                       stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
                       env=env,creationflags=flags,timeout=45,check=True)
        started=True
        sqlargs=['-XqAt','-v','ON_ERROR_STOP=1','-w','-h','127.0.0.1','-p',str(port),'-U','admin_prueba','-d','postgres']
        check('directorio aislado confirmado', Path(run('psql',sqlargs,b'SHOW data_directory;').stdout.decode().strip()).resolve()==(work/'data').resolve())
        run('psql',sqlargs,b'CREATE DATABASE tramites_pruebas;')
        sqlargs[-1]='tramites_pruebas'
        check('guardia real aprueba solo ajustes endurecidos', run('psql',sqlargs,query.encode(),opts).stdout.strip()==b't')
        for setting,value in [('log_statement','all'),('log_min_duration_statement','0'),('log_min_error_statement','error'),('log_min_duration_sample','0'),('log_transaction_sample_rate','1')]:
            check('guardia rechaza '+setting, run('psql',sqlargs,query.encode(),opts+' -c'+setting+'='+value).stdout.strip()==b'f')
        legacy=b'BEGIN; SET LOCAL log_statement=none; SET LOCAL log_min_duration_statement=-1; SELECT 1/0 /* CANARIO_ERROR_ANTERIOR */;'
        check('error SQL conserva fallo en variante anterior', run('psql',sqlargs,legacy,ok=False).returncode==3)
        check('error SQL conserva fallo con PGOPTIONS', run('psql',sqlargs,b'BEGIN; SELECT 1/0 /* CANARIO_ERROR_ENDURECIDO */;',opts,False).returncode==3)
        run('psql',sqlargs,b'BEGIN; SET LOCAL log_statement=none; SET LOCAL log_min_duration_statement=-1; SELECT 1 /* CANARIO_SAMPLE_ANTERIOR */; COMMIT;')
        run('psql',sqlargs,b'BEGIN; SELECT 1 /* CANARIO_SAMPLE_ENDURECIDO */; COMMIT;',opts)
        run('pg_ctl',['-D',work/'data','-m','fast','-w','stop']);started=False
        log=(work/'pg.log').read_text('utf-8')
        check('reproduce exposicion por error y sampling', 'CANARIO_ERROR_ANTERIOR' in log and 'CANARIO_SAMPLE_ANTERIOR' in log)
        check('contenido endurecido ausente del log', 'CANARIO_ERROR_ENDURECIDO' not in log and 'CANARIO_SAMPLE_ENDURECIDO' not in log)
        check('guardia antes de generar cualquier clave', text.index('if ! logging_seguro=') < text.index('clave = secrets.token_hex'))
        # Ejecutar el bloque Bash real con psql simulado. No invoca rotacion, sudo ni SQL.
        for label,output,rc in [('falso','f',0),('error','',3),('seguro','t',0)]:
            fake=work/(label+'.sh'); fake.write_text('cat >/dev/null\nprintf \'%s\\n\' "'+output+'"\nexit '+str(rc)+'\n',encoding='utf-8',newline='\n')
            probe=work/('probe-'+label+'.sh'); marker=work/('generado-'+label)
            probe.write_text('set -euo pipefail\nPSQL=(bash "$1")\n'+guard+'\nprintf listo > "$2"\n',encoding='utf-8',newline='\n')
            p=subprocess.run([bash,str(probe),str(fake),str(marker)],capture_output=True,timeout=15,creationflags=flags)
            check('Bash real '+label+' antes de generar secretos', (p.returncode==0 and marker.exists()) if label=='seguro' else (p.returncode!=0 and not marker.exists()))
        subprocess.run([bash,'-n',str(script)],capture_output=True,timeout=15,check=True,creationflags=flags)
        check('bash -n del script completo',True)
    finally:
        if started:
            run('pg_ctl',['-D',work/'data','-m','fast','-w','stop'])
    result={'total':len(cases),'casos':cases,'solo_sintetico':True,'claves_reales':False,
            'cluster_detenido':not(work/'data/postmaster.pid').exists(),'work':str(work)}
    print(json.dumps(result,ensure_ascii=False,indent=2))
    return 0


if __name__=='__main__':
    raise SystemExit(main())
