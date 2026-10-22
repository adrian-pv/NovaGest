# Nginx para NovaGest

Proxy de NovaGest por entorno (`staging`, `production`): la API (`/api/`, `/actuator/health`) va al backend en loopback y el resto sirve el frontend compilado. La etapa 1 es privada por Tailscale; la publicación en internet espera el dominio (ver [PUBLICACION.md](PUBLICACION.md)).

| Entorno | Escucha (privado) | Backend | Frontend |
|---------|-------------------|---------|----------|
| production | `<IP_PRIVADA>:8082` | `127.0.0.1:8080` | `/var/www/novagest/production` |
| staging | `<IP_PRIVADA>:8083` | `127.0.0.1:8081` | `/var/www/novagest/staging` |

## Archivos

- `novagest-privado.conf.template`: un `server` por entorno. Variables `LISTEN_IP`, `LISTEN_PORT`, `BACKEND_PORT`, `FRONTEND_ROOT`, `NG_ENTORNO`.
- `novagest-proxy-headers.conf` → `/etc/nginx/snippets/`. Envía `Host`, `X-Forwarded-For` (sobrescrito con `$remote_addr`), `X-Forwarded-Proto` y `X-Forwarded-Host`.
- `novagest-rate-limit.conf` → `/etc/nginx/conf.d/` (zona `novagest_login`, 10/min por IP, ráfaga 5).
- `systemd/novagest-espera-tailscale.conf` → drop-in de `nginx.service`: arranca después de `tailscaled` y espera hasta 60 s a la IP de `tailscale0` sin bloquear el arranque. Sin esto, si Nginx arranca antes que Tailscale falla el bind y caen también los demás sitios del servidor.
- `instalar-nginx-privado.sh` / `revertir-nginx-privado.sh`: instalación y retiro por entorno.
- `validar-nginx.sh` y `probar-proxy.py`: validación sin privilegios.
- `futuro/`: plantillas HTTP (ACME) y HTTPS por dominio, variables `DOMINIO`, `BACKEND_PORT`, `FRONTEND_ROOT`, `NG_ENTORNO`.

## Qué hace el backend y qué hace Nginx

El backend ya emite `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP de la API, `Cache-Control: no-store` y HSTS (cuando ve `X-Forwarded-Proto: https`), y limita por IP `/api/auth/login`, `/registro` y `/refresh`. Nginx no repite esas cabeceras en las rutas proxeadas; solo las pone al frontend, con una CSP propuesta para la tarjeta 42 que desarrollo debe confirmar.

Para que el backend vea la IP real del cliente (límites y bitácora), cada entorno necesita en su `app.env`:

```sh
FORWARD_HEADERS=native
PROXIES_CONFIANZA=<regex de la puerta de enlace de la red Docker del entorno>
```

Sin esas variables todos los clientes comparten la IP de la puerta de enlace y el límite de login del backend se vuelve global.

Otros detalles: `client_max_body_size 7m` (Spring admite 6 MB por solicitud multipart); `/actuator/*` distinto de `health` responde 404; `proxy_pass` sin sufijo conserva `/api` y la query.

## Instalación (operador Linux, con sudo)

Copiar este directorio a una carpeta de preparación del servidor y ejecutar primero en modo comprobación (no escribe nada):

```sh
sudo bash instalar-nginx-privado.sh staging
```

Comprueba que la IP de Tailscale esté en `tailscale0`, que el puerto esté libre, que el backend responda `UP` y que `nginx -t` pase **antes** de cambiar nada; anota el código de respuesta del sitio existente en 443 y muestra el sitio renderizado. Si todo está bien:

```sh
sudo bash instalar-nginx-privado.sh staging --aplicar
```

Guarda un respaldo de `/etc/nginx` en `/root/novagest-respaldos/`, instala los archivos, ejecuta `nginx -t` (si falla restaura y no recarga), recarga Nginx y verifica el health a través del proxy y que el sitio en 443 siga respondiendo igual. Para retirar: `sudo bash revertir-nginx-privado.sh staging`.

Producción se instala igual cuando su backend exista (`PERMITIR_SIN_BACKEND=1` para instalarlo antes; responderá 502).

## Validación sin privilegios

```sh
bash validar-nginx.sh       # nginx -t de ambos entornos en loopback
python3 probar-proxy.py     # Nginx temporal + backends simulados
```

`probar-proxy.py` verifica separación de entornos, `/api` y query preservados, health, `/actuator` restringido, frontend con fallback SPA y CSP, que la API no reciba cabeceras duplicadas, `X-Forwarded-For` saneado, `X-Forwarded-Host` y el 429 del login.

## Estado del entorno

IP, dominios, puertos efectivos y decisiones pendientes del entorno real se documentan en el repositorio privado del equipo, no aquí.
