# Publicación en internet

El dominio y el túnel los administra el responsable de infraestructura. La publicación usa un **túnel de Cloudflare** (`cloudflared` en el servidor, sin puertos entrantes): Cloudflare termina TLS y renueva el certificado, así que no hace falta Certbot ni abrir 80/443. Las plantillas de `futuro/` quedan solo para el caso de publicar con IP pública.

## Destino del túnel

El servicio de cada nombre público debe apuntar al **origen Nginx en loopback**, no al backend:

| Nombre público | Servicio del túnel |
|----------------|--------------------|
| `<DOMINIO_PRODUCCION>` | `http://127.0.0.1:8182` |
| `<DOMINIO_PRUEBAS>` | `http://127.0.0.1:8183` |

Si apunta directo al backend (`8080`/`8081`):
- no se sirve el frontend;
- `/actuator/*` queda expuesto a lo que decida Spring;
- todos los visitantes llegan con la misma IP, así que el límite de login del backend se vuelve global y la bitácora registra mal la IP.

Orden para cambiarlo sin cortar el servicio:
1. Instalar el origen (`instalar-nginx-privado.sh <entorno> --tunel --aplicar`) y confirmar que responde `UP`.
2. Cambiar el servicio en el túnel.
3. Ejecutar las comprobaciones de abajo.

Para volver atrás, se restaura el servicio anterior en el túnel.

## Variables de la aplicación

- `FORWARD_HEADERS=native` y `PROXIES_CONFIANZA=<puerta de enlace de la red Docker del entorno>`: la app toma la IP del visitante de `X-Forwarded-For` y el esquema `https`, con lo que emite HSTS.
- `CORS_ORIGINS` vacío si el frontend se sirve en el mismo origen (recomendado). Funciona en 443 por el túnel y también en los puertos privados (8082/8083) porque Nginx envía `X-Forwarded-Port`; sin esa cabecera, en un puerto propio los POST del navegador dan 403 "Invalid CORS request".

## Comprobaciones después de publicar

```sh
curl -s  https://<DOMINIO>/actuator/health                                 # {"status":"UP"...}
curl -s -o /dev/null -w '%{http_code}\n' https://<DOMINIO>/actuator/env   # 404 (Nginx), no 401 (Spring)
curl -sI https://<DOMINIO>/actuator/health | grep -i strict-transport      # requiere las variables de arriba
curl -s -o /dev/null -w '%{http_code}\n' https://<DOMINIO>/                # 200 cuando exista el frontend
```

Además:
- login desde el navegador sin 403 de CORS;
- IP del visitante correcta en la bitácora;
- el sitio existente del servidor responde igual que antes.

## Sin túnel (alternativa)

Con IP pública y NAT de 80/443 al servidor se usarían `futuro/novagest-publico-http.conf.template` (ACME) y `futuro/novagest-publico-https.conf.template` con Certbot. El servidor HTTPS comparte 443 con el sitio existente mediante `server_name` (SNI), sin `default_server`.
