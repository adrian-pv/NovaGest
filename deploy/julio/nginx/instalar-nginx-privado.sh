#!/usr/bin/env bash
set -euo pipefail

# Instala el proxy privado (Tailscale) de un entorno de NovaGest sin tocar los
# sitios existentes. Por defecto solo comprueba y muestra lo que haria; con
# --aplicar escribe, valida con nginx -t y recarga. Si nginx -t falla, restaura
# el respaldo y no recarga.
#
# Uso: sudo bash instalar-nginx-privado.sh staging|production [--aplicar]
# Variables opcionales: LISTEN_IP, LISTEN_PORT, BACKEND_PORT, FRONTEND_ROOT,
# PERMITIR_SIN_BACKEND=1 (instalar aunque el backend no responda UP).

base_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
entorno="${1:-}"
aplicar=0
[[ "${2:-}" == "--aplicar" ]] && aplicar=1

case "$entorno" in
    staging)    def_listen=8083; def_backend=8081 ;;
    production) def_listen=8082; def_backend=8080 ;;
    *) echo "Uso: sudo bash $0 staging|production [--aplicar]" >&2; exit 2 ;;
esac

if [[ $EUID -ne 0 ]]; then
    echo "Ejecutar con sudo." >&2
    exit 1
fi

LISTEN_PORT="${LISTEN_PORT:-$def_listen}"
BACKEND_PORT="${BACKEND_PORT:-$def_backend}"
FRONTEND_ROOT="${FRONTEND_ROOT:-/var/www/novagest/$entorno}"
NG_ENTORNO="$entorno"
LISTEN_IP="${LISTEN_IP:-$(tailscale ip -4 2>/dev/null | head -n1)}"

sitio="novagest-$entorno-privado.conf"
dest_sitio="/etc/nginx/sites-available/$sitio"
link_sitio="/etc/nginx/sites-enabled/$sitio"
dest_snippet="/etc/nginx/snippets/novagest-proxy-headers.conf"
dest_limite="/etc/nginx/conf.d/novagest-rate-limit.conf"
dest_dropin="/etc/systemd/system/nginx.service.d/novagest-espera-tailscale.conf"

fallo() { echo "ERROR: $*" >&2; exit 1; }
ok() { echo "OK: $*"; }

# 1. IP Tailscale asignada a la interfaz.
[[ -n "$LISTEN_IP" ]] || fallo "no se obtuvo la IP de Tailscale (tailscale ip -4)."
ip -4 -o addr show dev tailscale0 | grep -qF " $LISTEN_IP/" \
    || fallo "$LISTEN_IP no esta asignada a tailscale0."
ok "IP de escucha $LISTEN_IP en tailscale0"

# 2. Puerto libre, salvo que ya sea nuestro sitio (reinstalacion).
if ss -ltnH "sport = :$LISTEN_PORT" | grep -q . && [[ ! -e "$link_sitio" ]]; then
    ss -ltnp "sport = :$LISTEN_PORT" >&2
    fallo "el puerto $LISTEN_PORT ya esta en uso por otro servicio."
fi
ok "puerto $LISTEN_PORT disponible para $entorno"

# 3. Backend del entorno.
if curl -fsS -m 5 "http://127.0.0.1:$BACKEND_PORT/actuator/health" | grep -q '"status":"UP"'; then
    ok "backend 127.0.0.1:$BACKEND_PORT responde UP"
elif [[ "${PERMITIR_SIN_BACKEND:-0}" == "1" ]]; then
    echo "AVISO: backend 127.0.0.1:$BACKEND_PORT no responde UP; se instala igualmente (responderá 502)."
else
    fallo "backend 127.0.0.1:$BACKEND_PORT no responde UP (PERMITIR_SIN_BACKEND=1 para forzar)."
fi

# 4. La configuracion actual debe ser valida antes de tocarla.
nginx -t -q || fallo "nginx -t falla ANTES de cambiar nada; no se continua."
ok "configuracion actual de Nginx valida"

# Estado del sitio existente en 443, para comparar despues.
codigo_443_antes="$(curl -sk -o /dev/null -m 5 -w '%{http_code}' https://127.0.0.1:443/ || true)"
echo "Sitio existente en 443 responde: $codigo_443_antes"

tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT
export LISTEN_IP LISTEN_PORT BACKEND_PORT FRONTEND_ROOT NG_ENTORNO
envsubst '${LISTEN_IP} ${LISTEN_PORT} ${BACKEND_PORT} ${FRONTEND_ROOT} ${NG_ENTORNO}' \
    < "$base_dir/novagest-privado.conf.template" > "$tmp/$sitio"

echo "----- $dest_sitio (renderizado) -----"
cat "$tmp/$sitio"
echo "-------------------------------------"

if [[ $aplicar -eq 0 ]]; then
    echo "Modo comprobacion: no se escribio nada. Repetir con --aplicar para instalar."
    exit 0
fi

respaldo_dir=/root/novagest-respaldos
mkdir -p "$respaldo_dir"
chmod 700 "$respaldo_dir"
respaldo="$respaldo_dir/nginx-$(date +%Y%m%d-%H%M%S).tgz"
tar -czf "$respaldo" /etc/nginx $( [[ -d /etc/systemd/system/nginx.service.d ]] && echo /etc/systemd/system/nginx.service.d )
ok "respaldo en $respaldo"

nuevos=()
for f in "$dest_sitio" "$link_sitio" "$dest_snippet" "$dest_limite" "$dest_dropin"; do
    [[ -e "$f" || -L "$f" ]] || nuevos+=("$f")
done

restaurar() {
    echo "Restaurando respaldo..." >&2
    for f in "${nuevos[@]}"; do rm -f -- "$f"; done
    tar -xzf "$respaldo" -C /
    systemctl daemon-reload
    nginx -t -q && echo "Configuracion anterior restaurada y valida." >&2
}

install -m 644 "$base_dir/novagest-proxy-headers.conf" "$dest_snippet"
install -m 644 "$base_dir/novagest-rate-limit.conf" "$dest_limite"
install -m 644 "$tmp/$sitio" "$dest_sitio"
ln -sfn "$dest_sitio" "$link_sitio"
install -d -m 755 "$(dirname "$dest_dropin")"
install -m 644 "$base_dir/systemd/novagest-espera-tailscale.conf" "$dest_dropin"

if ! nginx -t; then
    restaurar
    fallo "nginx -t fallo con la nueva configuracion; no se recargo Nginx."
fi
systemctl daemon-reload
systemctl reload nginx
sleep 1

# Verificacion posterior.
estado=0
if curl -fsS -m 5 "http://$LISTEN_IP:$LISTEN_PORT/actuator/health" | grep -q '"status":"UP"'; then
    ok "http://$LISTEN_IP:$LISTEN_PORT/actuator/health responde UP a traves de Nginx"
else
    echo "AVISO: health por Nginx no responde UP (revisar backend y error.log)." >&2
    estado=1
fi
codigo_443_despues="$(curl -sk -o /dev/null -m 5 -w '%{http_code}' https://127.0.0.1:443/ || true)"
if [[ "$codigo_443_despues" == "$codigo_443_antes" ]]; then
    ok "sitio existente en 443 sin cambios ($codigo_443_despues)"
else
    echo "AVISO: el sitio en 443 cambio de $codigo_443_antes a $codigo_443_despues." >&2
    estado=1
fi
systemctl is-active --quiet nginx && ok "nginx activo"
echo "Revertir: sudo bash $base_dir/revertir-nginx-privado.sh $entorno"
exit $estado
