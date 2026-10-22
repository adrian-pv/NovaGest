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

Estado de staging al 21/10/2026: API UP, esquema `tramites`, 67 objetos bajo `tramites_owner`, nueve migraciones exitosas y checksums V9/V10 correctos. Flyway autentica como `tramites_migrador` y hace `SET ROLE tramites_owner`; la aplicación usa `tramites_app`. La configuración activa fue confirmada por Adrián. El [plan de cierre DBA](../../docs/dba/plan-cierre-staging.md) prevalece para la ventana de seguridad; no volver a preparar bases, redes o esquemas ya configurados. Producción no está autorizada en este cierre.

| Variable (`/opt/tramites/<entorno>/.env`) | Pruebas |
| --- | --- |
| `DB_HOST` | `host.docker.internal` (= `172.17.0.1`, donde escucha PostgreSQL y lo único que abre el firewall; dentro del contenedor `127.0.0.1` no sirve y `tramites-ctl` lo rechaza) |
| `DB_PORT` | `5432` |
| `DB_NAME` | `tramites_pruebas` |
| `DB_USER` / `DB_PASSWORD` | `tramites_app` (la app) |
| `FLYWAY_USER` / `FLYWAY_PASSWORD` | `tramites_migrador` (Flyway migra con este; también se usa para el respaldo previo) |
| `NET_BRIDGE` / `NET_SUBNET` | `br-nova-stg` / `172.30.11.0/24` (producción: `br-nova-prd` / `172.30.12.0/24`) |

Modelo ya configurado, documentado como referencia; **no ejecutar de nuevo durante este cierre**:

```sql
-- El backend no fija esquema: que ambos usuarios trabajen en "tramites"
ALTER ROLE tramites_app      IN DATABASE tramites_pruebas SET search_path = tramites;
ALTER ROLE tramites_migrador IN DATABASE tramites_pruebas SET search_path = tramites;
-- Flyway hace SET ROLE al dueño antes de crear: los defaults corresponden al dueño efectivo.
ALTER DEFAULT PRIVILEGES FOR ROLE tramites_owner IN SCHEMA tramites
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tramites_app;
ALTER DEFAULT PRIVILEGES FOR ROLE tramites_owner IN SCHEMA tramites
  GRANT USAGE, SELECT ON SEQUENCES TO tramites_app;
```

El migrador es miembro del owner con INHERIT/SET. `app.env` conserva un único `SPRING_FLYWAY_INIT_SQLS=SET ROLE tramites_owner` y el datasource usa `currentSchema=tramites`. `SPRING_FLYWAY_USER` y `SPRING_FLYWAY_PASSWORD` llegan desde `environment:` de Compose, con FLYWAY_USER/FLYWAY_PASSWORD de `.env`; Adrián retiró sus duplicados de `app.env`.

Excepción de mínimo privilegio pendiente de autorización: la app no necesita acceso a `tramites.flyway_schema_history`. Los defaults de negocio también alcanzaron esa tabla al crearla. La [corrección acotada](../../docs/dba/correccion-permisos-historial.md) y la [guardia posterior](../../docs/dba/scripts/guardia-historial-staging.sql) están preparadas, sin ejecutar. No quitar permisos a todas las tablas de negocio. Repetir la guardia después de la recreación y de futuros despliegues/restauraciones/GRANT; integrarla en el procedimiento requiere revisión del equipo y no se considera ya activa en el workflow.

`pg_hba.conf`, solo desde la red del contenedor:

```
host  tramites_pruebas  tramites_app,tramites_migrador  172.30.11.0/24  scram-sha-256
```

`listen_addresses` incluye `172.17.0.1` (ya está).

Firewall de daniel1 (`/opt/navcontrol/firewall.nft`, servicio `navcontrol-firewall`): su cadena `input` descarta todo lo no listado, incluido el tráfico de los contenedores. Para pruebas ya tiene, antes del `counter drop`:

```
iifname "br-*" ip saddr 172.30.11.0/24 ip daddr 172.17.0.1 tcp dport 5432 counter accept
```

Las referencias de preparación de otros entornos no son instrucciones para este cierre. No modificar firewall compartido, NavControl ni producción; cualquier verificación o cambio de esos entornos requiere su propio procedimiento y autorización.

Además:

- **V9 y V10 ya se aplicaron en staging:** no editarlas. El dictamen continúa CAMBIOS REQUERIDOS ANTES DEL CIERRE por seguridad pendiente y evidencia posterior; las mejoras de esquema se proponen como V11 separada. No afirmar que el DBA sea revisor obligatorio hasta comprobar/configurar ese control en GitHub.
- **Respaldo:** `tramites-ctl` hace `pg_dump` con el usuario de migraciones antes de cada despliegue a producción. Si falla, no despliega.

## Poner en marcha

Esta sección describe instalación genérica/histórica. **No ejecutar setup-server, editar otros entornos ni hacer docker login como parte de la ventana actual.** Staging ya funciona y Deploy está pausado. La rotación vigente es [migrador→app en una ventana](../../docs/dba/rotacion-staging-coordinada.md): DBA cambia claves sin editar archivos/reiniciar; Adrián actualiza ambas variables y recrea una vez con el mismo ID de imagen. `docker restart` no recarga variables; `tramites-ctl deploy` hace pull, por lo que el paso de conservación de imagen debe revisarlo Adrián según el plan. Mantener la red Compose; no fusionar #84.

1. **Actualizar el servidor** (en daniel1, con tu usuario y sudo). Ya está preparado de la vez anterior; esto instala la versión nueva y migra los `.env` sin perder nada:

   ```bash
   cd ~/NovaGest   # clon del repo con esta carpeta
   sudo APP_IMAGE=ghcr.io/<owner>/novagest bash deploy/adrian/server/setup-server.sh
   ```

2. **Datos de la base** (los da el DBA), en los dos entornos (`DB_*` y `FLYWAY_*`):

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

**Backend real ya validado en staging:** salud, conexión, propietarios, historial y checksums acreditados por la auditoría de solo lectura. Pendientes de esta ventana: ACL del historial, rotación coordinada y verificación posterior. Las pruebas opcionales de Nginx/usuario funcional se documentan aparte; los checks existentes no autorizan producción.

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
