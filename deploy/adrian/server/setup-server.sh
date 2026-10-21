#!/usr/bin/env bash
# Prepara (o actualiza) daniel1 para recibir despliegues de NovaGest desde el pipeline.
# Se puede volver a correr: no pisa contraseñas ni claves ya escritas en .env / app.env.
#
# Uso, desde la raíz del repo copiada al servidor:
#   sudo APP_IMAGE=ghcr.io/<owner>/novagest bash deploy/adrian/server/setup-server.sh [llave_pipeline.pub]
#
# La llave solo es obligatoria la primera vez. Puertos por contrato (COORDINACION-ADRIAN.md):
#   producción 127.0.0.1:8080, pruebas 127.0.0.1:8081 (se pueden cambiar con PROD_PORT / STAGING_PORT).
#
# Deja:
#   usuario "deploy"            sin contraseña; su llave SSH solo puede ejecutar tramites-ctl
#   /opt/tramites/bin/tramites-ctl   (dueño root) y enlace en /usr/local/bin/tramites-ctl
#   /opt/tramites/staging/      compose.yaml, .env y app.env de pruebas
#   /opt/tramites/production/   lo mismo para producción
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Correr con sudo." >&2; exit 1; }
PUBKEY_FILE="${1:-}"
APP_IMAGE="${APP_IMAGE:-}"
PROD_PORT="${PROD_PORT:-8080}"
STAGING_PORT="${STAGING_PORT:-8081}"
[[ "$PROD_PORT" =~ ^[0-9]+$ && "$STAGING_PORT" =~ ^[0-9]+$ && "$PROD_PORT" != "$STAGING_PORT" ]] \
  || { echo "Los puertos deben ser números distintos." >&2; exit 1; }
[[ -z "$APP_IMAGE" || "$APP_IMAGE" =~ ^[a-z0-9./_-]+$ ]] \
  || { echo "APP_IMAGE debe ir en minúsculas y sin etiqueta, ej. ghcr.io/equipo/novagest" >&2; exit 1; }
command -v docker >/dev/null || { echo "Primero instalar Docker (install-docker.sh)." >&2; exit 1; }
command -v curl >/dev/null || { echo "Falta curl (sudo apt install curl)." >&2; exit 1; }

HERE="$(cd "$(dirname "$0")/.." && pwd)"   # deploy/adrian
BASE=/opt/tramites

# 1. Usuario de despliegue
if ! id deploy >/dev/null 2>&1; then
  useradd --system --create-home --shell /bin/bash deploy
  passwd -l deploy >/dev/null
  echo "Usuario deploy creado."
fi
# Necesario para usar Docker. El grupo docker equivale a root; por eso la llave
# queda amarrada a tramites-ctl y el usuario no tiene contraseña.
usermod -aG docker deploy

# 2. Llave del pipeline, restringida a un solo comando
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
if [[ -n "$PUBKEY_FILE" ]]; then
  key="$(tr -d '\r' <"$PUBKEY_FILE")"
  [[ "$key" =~ ^ssh-(ed25519|rsa)\  ]] || { echo "La llave no parece pública (ssh-ed25519 ...)." >&2; exit 1; }
  echo "restrict,command=\"$BASE/bin/tramites-ctl\" $key" >/home/deploy/.ssh/authorized_keys
  echo "Llave del pipeline instalada (solo puede ejecutar tramites-ctl)."
elif [[ ! -s /home/deploy/.ssh/authorized_keys ]]; then
  echo "Falta la llave pública del pipeline (primera ejecución)." >&2; exit 1
else
  echo "Llave del pipeline: se conserva la que ya estaba."
fi
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

# 3. Script de control (ubicación real) + enlace en el PATH
install -d -m 755 -o root -g root "$BASE" "$BASE/bin"
install -m 755 -o root -g root "$HERE/server/tramites-ctl" "$BASE/bin/tramites-ctl"
ln -sfn "$BASE/bin/tramites-ctl" /usr/local/bin/tramites-ctl
echo "tramites-ctl en $BASE/bin/tramites-ctl (enlace: /usr/local/bin/tramites-ctl)"

# Cambia (o agrega) KEY=valor en un archivo de variables.
setvar() {
  local file="$1" key="$2" val="$3"
  if grep -qE "^$key=" "$file"; then sed -i "s|^$key=.*|$key=$val|" "$file"; else echo "$key=$val" >>"$file"; fi
}

# Agrega KEY=valor solo si la variable no existe.
addvar() { grep -qE "^$2=" "$1" || echo "$2=$3" >>"$1"; }

# 4. Un directorio por entorno
for env in staging production; do
  dir="$BASE/$env"
  install -d -m 750 -o deploy -g deploy "$dir" "$dir/backups"
  install -m 644 -o deploy -g deploy "$HERE/compose.yaml" "$dir/compose.yaml"
  if [[ "$env" == staging ]]; then port=$STAGING_PORT; net=novagest-staging-net; subnet=172.30.11.0/24
  else port=$PROD_PORT; net=novagest-production-net; subnet=172.30.12.0/24; fi

  umask 077
  if [[ ! -f "$dir/.env" ]]; then
    cat >"$dir/.env" <<EOF
# NovaGest — $env. Permisos 600; no copiar a ningún otro lado.
COMPOSE_PROJECT_NAME=novagest-$env
APP_IMAGE=${APP_IMAGE:-CAMBIAR}
APP_PORT=$port

# PostgreSQL externo (los da el DBA). Si la base está en este servidor: DB_HOST=host.docker.internal
DB_HOST=CAMBIAR
DB_PORT=5432
DB_NAME=CAMBIAR
DB_USER=CAMBIAR
DB_PASSWORD=CAMBIAR
# Usuario con el que Flyway aplica las migraciones (distinto del de la app)
FLYWAY_USER=CAMBIAR
FLYWAY_PASSWORD=CAMBIAR

# Red del contenedor (externa a compose): el firewall y pg_hba.conf dejan pasar a PostgreSQL solo desde su subred
NET_NAME=$net
NET_SUBNET=$subnet
EOF
    echo "Creado $dir/.env — faltan los datos de la base (DB_*)."
  else
    # Actualización desde la versión anterior: nombre del proyecto, puerto e imagen.
    sed -i '/^SPRING_PROFILE=/d' "$dir/.env"
    setvar "$dir/.env" COMPOSE_PROJECT_NAME "novagest-$env"
    setvar "$dir/.env" APP_PORT "$port"
    [[ -n "$APP_IMAGE" ]] && setvar "$dir/.env" APP_IMAGE "$APP_IMAGE"
    # Variables nuevas: se agregan solo si faltan (no se pisan valores ya llenados).
    addvar "$dir/.env" FLYWAY_USER CAMBIAR
    addvar "$dir/.env" FLYWAY_PASSWORD CAMBIAR
    sed -i '/^NET_BRIDGE=/d' "$dir/.env"   # ya no se usa: la red es externa
    addvar "$dir/.env" NET_NAME "$net"
    addvar "$dir/.env" NET_SUBNET "$subnet"
    echo "Actualizado $dir/.env (se conservaron los datos de la base)."
  fi

  [[ -f "$dir/app.env" ]] || cp "$HERE/app.env.example" "$dir/app.env"
  # Flyway (ver DESPLIEGUE.md): esquema tramites y objetos a nombre del dueño que indique el DBA.
  addvar "$dir/app.env" SPRING_FLYWAY_SCHEMAS tramites
  addvar "$dir/app.env" SPRING_FLYWAY_DEFAULT_SCHEMA tramites
  addvar "$dir/app.env" SPRING_FLYWAY_INIT_SQLS "SET ROLE CAMBIAR"
  # Clave JWT propia de cada entorno, generada aquí (>= 32 caracteres). Nunca sale del servidor.
  if grep -qE '^JWT_SECRET=(CAMBIAR)?$' "$dir/app.env"; then
    setvar "$dir/app.env" JWT_SECRET "$(openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-48)"
    echo "Generada JWT_SECRET para $env."
  fi
  chown deploy:deploy "$dir/.env" "$dir/app.env"
  chmod 600 "$dir/.env" "$dir/app.env"

  # Red del entorno: se crea si falta; si ya existe, tiene que tener la subred esperada.
  if actual="$(docker network inspect -f '{{range .IPAM.Config}}{{.Subnet}} {{end}}' "$net" 2>/dev/null)"; then
    [[ " $actual " == *" $subnet "* ]] \
      || { echo "La red $net existe con otra subred ($actual); se esperaba $subnet." >&2; exit 1; }
    echo "Red $net ($subnet): ya existe."
  else
    docker network create --driver bridge --subnet "$subnet" "$net" >/dev/null
    echo "Red $net ($subnet) creada."
  fi
done

command -v pg_dump >/dev/null || echo "Aviso: falta pg_dump (sudo apt install postgresql-client). Sin él no se despliega a producción."

cat <<EOF

Listo. Pendiente (ver deploy/adrian/DESPLIEGUE.md):
  1. Datos de la base por entorno (DBA):  sudo -u deploy nano $BASE/staging/.env   (y production)
  2. Imagen, si aún dice CAMBIAR:          APP_IMAGE en los dos .env
  3. Acceso del usuario deploy a GHCR:     sudo -iu deploy docker login ghcr.io -u <usuario-github>
  4. Probar:                               sudo -u deploy tramites-ctl status staging
EOF
