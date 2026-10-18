# Despliegue de NovaGest — parte de Adrián (DES-9 a DES-12)

Imagen, despliegue a pruebas, producción con aprobación y rollback. Sigue el contrato de [`deploy/julio/COORDINACION-ADRIAN.md`](../julio/COORDINACION-ADRIAN.md). No modifica el backend, `ci.yml`, ni la configuración de Nginx de Julio.

## Respuestas al contrato

| Punto del contrato | Cómo queda |
| --- | --- |
| Ubicación real de `tramites-ctl` | `/opt/tramites/bin/tramites-ctl` (dueño root). `setup-server.sh` crea además el enlace `/usr/local/bin/tramites-ctl`. |
| Puertos | Producción `127.0.0.1:8080 -> 8080`, pruebas `127.0.0.1:8081 -> 8080`. Nunca en `0.0.0.0`. El Nginx privado de Julio (8082/8083) apunta ahí. |
| Rutas | Sin reescritura: `/api/*` y `GET /actuator/health` llegan tal cual. |
| Perfil | `SPRING_PROFILES_ACTIVE=prod` fijo en `compose.yaml`, también en pruebas (el backend no tiene perfil `staging`; pruebas usa `prod` con su propia base). |
| Base de datos | PostgreSQL externo por `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` en `/opt/tramites/<entorno>/.env`. No se usa el `docker-compose.yml` de la raíz. |
| `JWT_SECRET` | Generada en el servidor por `setup-server.sh` (48 caracteres, distinta por entorno), en `app.env` con permisos 600. Nunca pasa por GitHub ni por chat. |
| Comprobantes | Volumen con nombre por entorno (`novagest-production_comprobantes`, `novagest-staging_comprobantes`) montado en `/data/comprobantes`. Docker copia el dueño de la imagen (`novagest`), así que la app escribe sin cambiar permisos. Persiste entre versiones y rollbacks. |
| Salud | La imagen no trae `curl` ni `HEALTHCHECK`; `tramites-ctl` consulta `http://127.0.0.1:<puerto>/actuator/health` desde el host y exige `"status":"UP"`. |
| NavControl | No se toca: la app solo usa 8080/8081 en loopback; 443 → 9080 sigue igual. |
| CI | `ci.yml` del equipo no se modifica. `deploy.yml` arranca cuando `ci.yml` termina en verde. |

## Archivos

| Archivo | Para qué |
| --- | --- |
| `.github/workflows/deploy.yml` | Tras CI verde: develop → imagen en GHCR → pruebas; main → misma imagen → aprobación → producción; manual: `status` / `rollback` |
| `.github/workflows/remote.yml` | Entra por Tailscale y llama a `tramites-ctl`; prueba opcional por el Nginx privado |
| `.github/workflows/seguridad.yml` | gitleaks (secretos) y trivy (dependencias) en PR y push, aparte de `ci.yml` |
| `deploy/adrian/compose.yaml` | Contenedor de la app para un entorno |
| `deploy/adrian/app.env.example` | Plantilla de `app.env` (`JWT_SECRET`) |
| `deploy/adrian/server/setup-server.sh` | Prepara o **actualiza** el servidor; se puede volver a correr sin perder datos |
| `deploy/adrian/server/tramites-ctl` | `deploy` / `rollback` / `status`; respaldo previo y reversión automática |
| `deploy/adrian/server/install-docker.sh` | DES-5 (ya aplicado en daniel1) |

## Flujo

```
push develop ─► CI (mvnw verify) ✔ ─► deploy.yml: build con el Dockerfile del backend ─► GHCR ─► trivy
                                     ─► Tailscale + SSH ─► tramites-ctl deploy staging <tag>
                                          └ espera /actuator/health UP; si no, vuelve sola a la anterior
merge a main ─► CI ✔ ─► ¿existe la imagen de ese mismo código? ─► aprobación ─► tramites-ctl deploy production
                                                                     └ pg_dump antes (Flyway migra al arrancar)
manual ─────► tramites-ctl rollback <entorno>
```

## Base de datos (decisión del DBA)

Dentro del contenedor, `127.0.0.1` es el propio contenedor, así que `DB_HOST=127.0.0.1` no llega a PostgreSQL (`tramites-ctl` lo rechaza). Según dónde esté la base:

| Caso | `DB_HOST` | Lo que debe permitir el DBA |
| --- | --- | --- |
| Base en otro servidor | Host o IP del DBA | Conexión desde daniel1 |
| Base en daniel1 (escucha en `192.168.50.10`) | `192.168.50.10` | Regla en `pg_hba.conf` para la red de Docker (`172.16.0.0/12`) con `scram-sha-256` |
| Base en daniel1, por la puerta del host | `host.docker.internal` | Lo anterior y además `listen_addresses` con la IP de `docker0` (`172.17.0.1`) |

Además, con el DBA:

- **Permisos de migración:** Flyway corre al arrancar con el mismo usuario de la app. Ese usuario necesita los permisos para aplicar migraciones que acuerde el DBA.
- **V9 y V10 son borradores:** no aprobar el despliegue a producción hasta que el DBA las revise. Conviene agregar al DBA como revisor del environment `production`.
- **Respaldo:** `tramites-ctl` hace `pg_dump` con esos mismos datos antes de cada despliegue a producción. Si falla, no despliega. Requiere `pg_dump` en el host (ya está).

## Poner en marcha

1. **Actualizar el servidor** (en daniel1, con tu usuario y sudo). Ya está preparado de la vez anterior; esto instala la versión nueva y migra los `.env` sin perder nada:

   ```bash
   cd ~/NovaGest   # clon del repo con esta carpeta
   sudo APP_IMAGE=ghcr.io/<owner>/novagest bash deploy/adrian/server/setup-server.sh
   ```

2. **Datos de la base** (los da el DBA), en los dos entornos:

   ```bash
   sudo -u deploy nano /opt/tramites/staging/.env
   sudo -u deploy nano /opt/tramites/production/.env
   ```

3. **Acceso a GHCR** del usuario `deploy` (token de GitHub con solo `read:packages`):

   ```bash
   sudo -iu deploy docker login ghcr.io -u <tu-usuario-github>
   ```

4. **GitHub** (repo donde corre el CI):

   | Dónde | Nombre | Valor |
   | --- | --- | --- |
   | Secret | `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET` | OAuth client de Tailscale con `tag:ci` (Daniel) |
   | Secret | `DEPLOY_SSH_KEY` | Contenido de `tramites-ci` (llave privada del pipeline) |
   | Secret | `DEPLOY_KNOWN_HOSTS` | `ssh-keyscan -t ed25519 100.87.27.107` (huella `SHA256:DZSekPpLB541wOec6GNGcwhorSAM8fBGlivzSmP+aZU`) |
   | Variable | `DEPLOY_HOST` | `100.87.27.107` |
   | Variable de `staging` | `SMOKE_URL` | `http://100.87.27.107:8083` cuando Julio active el Nginx privado (opcional) |
   | Environment | `production` | *Required reviewers*: el equipo y el DBA |

   Proteger `develop` y `main`: PR obligatorio con "Compilar y probar" y los checks de `Seguridad` en verde.

5. **Política de Tailscale** (Daniel): `tag:ci` solo puede llegar a `100.87.27.107:22`.

## Pruebas de aceptación

| Tarjeta | Hecho cuando |
| --- | --- |
| DES-9 | Un push a develop termina con la imagen `ghcr.io/<owner>/novagest:<tag>` publicada y escaneada |
| DES-10 | `tramites-ctl status staging` muestra la etiqueta nueva y `health ... UP` sin que nadie entre al servidor |
| DES-11 | Un merge a main queda en "Waiting for review" hasta que alguien aprueba |
| DES-12 | (1) Una versión que no arranca vuelve sola a la anterior. (2) Actions → Deploy → `rollback` deja la versión anterior respondiendo en minutos |

**Ya probado en un entorno de prueba con Docker y Compose reales** (imagen simulada que respeta el contrato): despliegue a pruebas y producción en `127.0.0.1:8081` / `127.0.0.1:8080`, escritura en el volumen de comprobantes como usuario sin privilegios, `pg_dump` previo a producción (y bloqueo si falla), reversión automática ante una versión que no arranca, rollback manual, `status`, rechazo de `DB_HOST=localhost` y actualización de un `.env` del formato anterior.

**Falta probar con el backend real:** construir la imagen en Actions, la conexión a la base del DBA y Flyway.

## Rollback y migraciones

Cambiar de imagen no deshace una migración. Flyway ignora por defecto las migraciones "del futuro", pero Hibernate valida el esquema (`ddl-auto=validate`): si una versión nueva borró o renombró columnas, la anterior no arranca. Por eso las migraciones deben ser compatibles hacia atrás (primero se agrega y lo viejo se quita en una versión posterior).

Si hay que deshacer una migración en producción, se restaura el respaldo previo:

```bash
sudo -iu deploy
cd /opt/tramites/production
export APP_TAG="$(cat current_tag)"
docker compose --env-file .env stop app
PGPASSWORD=... pg_restore -h <DB_HOST> -U <DB_USER> -d <DB_NAME> --clean --if-exists backups/pre-deploy-<fecha>-<tag>.dump
tramites-ctl rollback production
```

## Notas para Marlon (respaldo diario)

Los comprobantes NO están en la base: respaldar también el volumen `novagest-production_comprobantes` (en `/var/lib/docker/volumes/novagest-production_comprobantes/_data`, requiere root), coordinado con el volcado de la base.
