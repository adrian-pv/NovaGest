"""Prueba aislada del proxy con backends simulados; no usa la API ni sudo."""
import http.client
import json
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Backend(BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps({"path": self.path, "backend": self.server.server_port,
                           "xff": self.headers.get("X-Forwarded-For"),
                           "xfh": self.headers.get("X-Forwarded-Host"),
                           "xfp": self.headers.get("X-Forwarded-Proto"),
                           "xfport": self.headers.get("X-Forwarded-Port")}).encode()
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    do_POST = do_GET

    def log_message(self, *args):
        pass


def available_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def request(port, path, method="GET", headers=None):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
    try:
        conn.request(method, path, headers={"X-Forwarded-For": "203.0.113.99", **(headers or {})})
        response = conn.getresponse()
        return response.status, dict(response.getheaders()), response.read()
    finally:
        conn.close()


base = Path(__file__).resolve().parent
servers = []
process = None
try:
    for _ in range(2):
        server = ThreadingHTTPServer(("127.0.0.1", 0), Backend)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        servers.append(server)
    # Acceso privado de cada entorno y origen del tunel de cada entorno.
    ports = [available_port() for _ in range(4)]
    if len(set(ports)) != len(ports):
        raise RuntimeError("Puertos temporales repetidos; volver a ejecutar")
    with tempfile.TemporaryDirectory(prefix="novagest-proxy-test-") as tmp:
        root = Path(tmp)
        templates = {name: (base / f"novagest-{name}.conf.template").read_text()
                     for name in ("rutas", "privado", "tunel")}
        sites = []
        for index, entorno in enumerate(("production", "staging")):
            www = root / f"www-{entorno}"
            www.mkdir()
            (www / "index.html").write_text(f"<!doctype html><title>{entorno}</title>")
            (www / "assets").mkdir()
            (www / "assets" / "app-abc123.js").write_text("console.log('ok');")
            replacements = {
                "${LISTEN_IP}": "127.0.0.1",
                "${LISTEN_PORT}": str(ports[index]),
                "${TUNEL_PORT}": str(ports[2 + index]),
                "${BACKEND_PORT}": str(servers[index].server_port),
                "${FRONTEND_ROOT}": str(www),
                "${NG_ENTORNO}": entorno,
                "/var/log/nginx/": f"{root}/",
                "/etc/nginx/snippets/novagest-proxy-headers.conf": str(base / "novagest-proxy-headers.conf"),
                f"/etc/nginx/snippets/novagest-{entorno}-rutas.conf": str(root / f"rutas-{entorno}.conf"),
            }
            rendered = {}
            for name, config in templates.items():
                for old, new_value in replacements.items():
                    config = config.replace(old, new_value)
                rendered[name] = config
            (root / f"rutas-{entorno}.conf").write_text(rendered["rutas"])
            sites += [rendered["privado"], rendered["tunel"]]
        (root / "sites.conf").write_text("\n".join(sites))
        (root / "nginx.conf").write_text(
            f"daemon off; worker_processes 1; pid {root}/nginx.pid;\n"
            f"error_log {root}/error.log; events {{ worker_connections 64; }}\n"
            f"http {{ access_log off; client_body_temp_path {root}/body; "
            f"proxy_temp_path {root}/proxy; include {base}/novagest-rate-limit.conf; "
            f"include {root}/sites.conf; }}\n")
        process = subprocess.Popen(["nginx", "-p", str(root) + "/", "-c", str(root / "nginx.conf")],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        try:
            for attempt in range(40):
                if process.poll() is not None:
                    raise RuntimeError(process.stderr.read().decode())
                try:
                    request(ports[0], "/actuator/health")
                    break
                except OSError:
                    time.sleep(0.1)
            else:
                raise RuntimeError("Nginx temporal no inició")
            for index, port in enumerate(ports[:2]):
                for path in ("/actuator/health", "/api/tramites?pagina=1"):
                    status, headers, body = request(port, path)
                    data = json.loads(body)
                    assert status == 200 and data["path"] == path, (status, body)
                    assert data["backend"] == servers[index].server_port
                    assert data["xff"] == "127.0.0.1", data
                    assert data["xfh"] == "127.0.0.1", data
                    # Las cabeceras de seguridad de la API las pone el backend; Nginx no las duplica.
                    assert "X-Frame-Options" not in headers, headers
                status, headers, body = request(port, "/actuator/env")
                assert status == 404, status
                for path in ("/", "/mis-tramites"):
                    status, headers, body = request(port, path)
                    assert status == 200 and b"<title>" in body, (status, body)
                    assert headers["X-Frame-Options"] == "DENY"
                    assert "frame-ancestors 'none'" in headers["Content-Security-Policy"]
                    # El acceso privado es HTTP: no lleva HSTS.
                    assert "Strict-Transport-Security" not in headers, headers
                    # Sin el puerto propio el backend rechaza los POST del navegador (CORS 403).
                    assert data["xfport"] == str(port), data
                assert data["xfp"] == "http", data
                # Archivos de Vite: cache larga si existen y 404 (no index.html) si faltan.
                status, headers, body = request(port, "/assets/app-abc123.js")
                assert status == 200 and "immutable" in headers["Cache-Control"], (status, headers)
                assert request(port, "/assets/no-existe.js")[0] == 404
            statuses = [request(ports[0], "/api/auth/login", "POST")[0] for _ in range(15)]
            assert 200 in statuses and 429 in statuses, statuses
            # Origen del tunel: IP del visitante desde CF-Connecting-IP y proto https.
            for index, port in enumerate(ports[2:]):
                status, headers, body = request(port, "/api/tramites", headers={"CF-Connecting-IP": "198.51.100.20"})
                data = json.loads(body)
                assert status == 200 and data["backend"] == servers[index].server_port, (status, body)
                assert data["xff"] == "198.51.100.20" and data["xfp"] == "https", data
                assert data["xfport"] == "443", data
                assert request(port, "/actuator/env")[0] == 404
                # El origen del túnel sirve HTTPS hacia el visitante: el frontend lleva HSTS.
                status, headers, body = request(port, "/")
                assert status == 200 and headers.get("Strict-Transport-Security") == "max-age=31536000", headers
            visitante = {"CF-Connecting-IP": "198.51.100.30"}
            statuses = [request(ports[3], "/api/auth/login", "POST", visitante)[0] for _ in range(15)]
            assert 429 in statuses, statuses
            otro = request(ports[3], "/api/auth/login", "POST", {"CF-Connecting-IP": "198.51.100.31"})[0]
            assert otro == 200, otro
            print("OK: entornos separados; /api y query preservados; health; /actuator restringido; "
                  "frontend con fallback SPA y CSP; cabeceras API sin duplicar; XFF saneado; login 429; "
                  "tunel con IP del visitante, proto https y limite por visitante; X-Forwarded-Port; "
                  "assets con cache larga y 404 si faltan")
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
            process.stderr.close()
            process = None
finally:
    if process is not None and process.poll() is None:
        process.kill()
        process.wait()
    for server in servers:
        server.shutdown()
        server.server_close()
