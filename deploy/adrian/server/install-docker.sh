#!/usr/bin/env bash
# Tarjeta 5 — Instalar Docker y Compose (Ubuntu o Debian), desde el repositorio oficial.
# Uso:  sudo bash install-docker.sh
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Correr con sudo." >&2; exit 1; }
# shellcheck disable=SC1091
. /etc/os-release
case "$ID" in
  ubuntu|debian) ;;
  *) echo "Este script cubre Ubuntu/Debian; el servidor es '$ID'. Ver https://docs.docker.com/engine/install/" >&2; exit 1 ;;
esac

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  echo "Docker ya está instalado: $(docker --version) / $(docker compose version)"
else
  apt-get update
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$ID ${VERSION_CODENAME} stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

# Logs con tope de tamaño y contenedores que siguen vivos si se reinicia el demonio.
install -d -m 0755 /etc/docker
if [[ ! -f /etc/docker/daemon.json ]]; then
  cat >/etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" },
  "live-restore": true,
  "no-new-privileges": true
}
JSON
  echo "Creado /etc/docker/daemon.json"
else
  echo "Ya existe /etc/docker/daemon.json; no se tocó. Revisar que tenga límites de logs."
fi

systemctl enable --now docker
systemctl restart docker

echo "--- Prueba (criterio de la tarjeta 5) ---"
docker run --rm hello-world | grep -q "Hello from Docker" && echo "OK: un contenedor de prueba levanta."
docker --version
docker compose version
