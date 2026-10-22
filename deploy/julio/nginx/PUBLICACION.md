# Publicación en internet (pendiente de dominio)

El dominio público lo gestiona el responsable de infraestructura. Mientras no esté confirmado, NovaGest se prueba solo por la red privada (Tailscale) con `instalar-nginx-privado.sh`.

## Datos que hacen falta antes de activar HTTPS

| Dato | Para qué |
|------|----------|
| Nombre de producción y de pruebas (p. ej. `<DOMINIO>`, `pruebas.<DOMINIO>`) | `server_name` y certificado |
| Destino del DNS (IP pública con NAT, o túnel) | Que el tráfico llegue al servidor |
| ¿IP pública propia o CGNAT? | Con CGNAT no hay reenvío de puertos: hace falta túnel |
| Puerto 80 entrante | Validación HTTP-01 de Certbot y renovación |
| Puerto 443 entrante | Servicio HTTPS |
| Reglas del firewall del servidor | Aceptar 80/443 en la interfaz de salida a internet |

Si no hay 80 entrante, usar la validación DNS-01 con la API del proveedor de DNS.

## Convivencia con el sitio existente en 443

El servidor ya tiene otro sitio HTTPS en 443. NovaGest se añade como **otro `server` con su propio `server_name`** en el mismo 443 (SNI); no se reemplaza ni se cambia el `default_server` del sitio existente. Validar con `nginx -t` y comprobar el código de respuesta del sitio existente antes y después (como hace `instalar-nginx-privado.sh`).

## Variables de la aplicación al tener dominio

- `FORWARD_HEADERS=native` y `PROXIES_CONFIANZA=<puerta de enlace de la red Docker del entorno>`: la app ve la IP real del cliente y `X-Forwarded-Proto: https`, con lo que emite HSTS.
- `CORS_ORIGINS` vacío si el frontend se sirve en el mismo dominio (recomendado).

## Comprobaciones después de publicar

```sh
curl -sI https://<DOMINIO>/actuator/health | grep -i strict-transport
curl -s  https://<DOMINIO>/actuator/health
curl -s -o /dev/null -w '%{http_code}\n' https://<DOMINIO>/actuator/env   # 404
certbot renew --dry-run
```

Además: login desde el navegador sin 403 de CORS, IP del cliente correcta en la bitácora y el sitio existente respondiendo igual que antes.
