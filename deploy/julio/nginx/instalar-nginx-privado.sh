#!/usr/bin/env bash
set -euo pipefail

# Instala el proxy de un entorno de NovaGest sin tocar los sitios existentes:
# acceso privado por Tailscale y, con --tunel, un origen en loopback para un
# tunel de Cloudflare. Por defecto solo comprueba y muestra lo que haria; con
# --aplicar escribe, valida con nginx -t y recarga. Si nginx -t falla, restaura
# el respaldo y no recarga.
#
# Uso: sudo bash instalar-nginx-privado.sh staging|production [--tunel] [--aplicar]
# Variables opcionales: LISTEN_IP, LISTEN_PORT, TUNEL_PORT, BACKEND_PORT,
# FRONTEND_ROOT, PERMITIR_SIN_BACKEND=1 (instalar aunque el backend no responda UP).

base_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
entorno="${1:-}"
shift || true
aplicar=0
tunel=0
for arg in "$@"; do
    case "$arg" in
        --aplicar) aplicar=1 ;;
        --tunel) tunel=1 ;;
        *) echo "Opcion desconocida: $arg" >&2; exit 2 ;;
    esac
done

case "$entorno" in
    staging)    def_listen=8083; def_tunel=8183; def_backend=8081 ;;
    production) def_listen=8082; def_tunel=8182; def_backend=8080 ;;
    *) echo "Uso: sudo bash $0 staging|production [--tunel] [--aplicar]" >&2; exit 2 ;;
esac

if [[ $EUID -ne 0 ]]; then
    echo "Ejecutar con sudo." >&2
    exit 1
fi

LISTEN_PORT="${LISTEN_PORT:-$def_listen}"
TUNEL_PORT="${TUNEL_PORT:-$def_tunel}"
BACKEND_PORT="${BACKEND_PORT:-$def_backend}"
FRONTEND_ROOT="${FRONTEND_ROOT:-/var/www/novagest/$entorno}"
NG_ENTORNO="$entorno"
LISTEN_IP="${LISTEN_IP:-$(tailscale ip -4 2>/dev/null | head -n1)}"

sitio="novagest-$entorno-privado.conf"
dest_sitio="/etc/nginx/sites-available/$sitio"
link_sitio="/etc/nginx/sites-enabled/$sitio"
sitio_tunel="novagest-$entorno-tunel.conf"
dest_tunel="/etc/nginx/sites-available/$sitio_tunel"
link_tunel="/etc/nginx/sites-enabled/$sitio_tunel"
dest_rutas="/etc/nginx/snippets/novagest-$entorno-rutas.conf"
dest_snippet="/etc/nginx/snippets/novagest-proxy-headers.conf"
dest_limite="/etc/nginx/conf.d/novagest-rate-limit.conf"
dest_dropin="/etc/systemd/system/nginx.service.d/novagest-espera-tailscale.conf"

fallo() { echo "ERROR: $*" >&2; exit 1; }
ok() { echo "OK: $*"; }

puerto_libre() {
    local puerto=$1 enlace=$2
    if ss -ltnH "sport = :$puerto" | grep -q . && [[ ! -e "$enlace" ]]; then
        ss -ltnp "sport = :$puerto" >&2
        fallo "el puerto $puerto ya esta en uso por otro servicio."
    fi
    ok "puerto $puerto disponible para $entorno"
}

# 1. IP Tailscale asignada a la interfaz.
[[ -n "$LISTEN_IP" ]] || fallo "no se obtuvo la IP de Tailscale (tailscale ip -4)."
ip -4 -o addr show dev tailscale0 | grep -qF " $LISTEN_IP/" \
    || fallo "$LISTEN_IP no esta asignada a tailscale0."
ok "IP de escucha $LISTEN_IP en tailscale0"

# 2. Puertos libres, salvo que ya sean nuestros sitios (reinstalacion).
puerto_libre "$LISTEN_PORT" "$link_sitio"
[[ $tunel -eq 1 ]] && puerto_libre "$TUNEL_PORT" "$link_tunel"

# 3. Backend del entorno.
if curl -fsS -m 5 "http://127.0.0.1:$BACKEND_PORT/actuator/health" | grep -q '"status":"UP"'; then
    ok "backend 127.0.0.1:$BACKEND_PORT responde UP"
elif [[ "${PERMITIR_SIN_BACKEND:-0}" == "1" ]]; then
    echo "AVISO: backend 127.0.0.1:$BACKEND_PORT no responde UP; se instala igualmente (respondera 502)."
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
export LISTEN_IP LISTEN_PORT TUNEL_PORT BACKEND_PORT FRONTEND_ROOT NG_ENTORNO
render() {
    envsubst '${LISTEN_IP} ${LISTEN_PORT} ${TUNEL_PORT} ${BACKEND_PORT} ${FRONTEND_ROOT} ${NG_ENTORNO}' \
        < "$base_dir/$1" > "$tmp/$2"
}
render novagest-rutas.conf.template rutas.conf
render novagest-privado.conf.template "$sitio"
[[ $tunel -eq 1 ]] && render novagest-tunel.conf.template "$sitio_tunel"

for f in "$sitio" "$( [[ $tunel -eq 1 ]] && echo "$sitio_tunel" )"; do
    [[ -n "$f" ]] || continue
    echo "----- $f (renderizado) -----"
    grep -vE '^\s*(#|$)' "$tmp/$f"
done
echo "----- rutas: $dest_rutas (backend 127.0.0.1:$BACKEND_PORT, frontend $FRONTEND_ROOT) -----"

if [[ $aplicar -eq 0 ]]; then
    echo "Modo comprobacion: no se escribio nada. Repetir con --aplicar para instalar."
    exit 0
fi

respaldo_dir=/root/novagest-respaldos
mkdir -p "$respaldo_dir"
chmod 700 "$respaldo_dir"
respaldo="$respaldo_dir/nginx-$(date +%Y%m%d-%H%M%S).tgz"
tar -czPf "$respaldo" /etc/nginx $( [[ -d /etc/systemd/system/nginx.service.d ]] && echo /etc/systemd/system/nginx.service.d )
ok "respaldo en $respaldo"

nuevos=()
for f in "$dest_sitio" "$link_sitio" "$dest_tunel" "$link_tunel" "$dest_rutas" "$dest_snippet" "$dest_limite" "$dest_dropin"; do
    [[ -e "$f" || -L "$f" ]] || nuevos+=("$f")
done

restaurar() {
    echo "Restaurando respaldo..." >&2
    for f in "${nuevos[@]}"; do rm -f -- "$f"; done
    tar -xzPf "$respaldo"
    systemctl daemon-reload
    nginx -t -q && echo "Configuracion anterior restaurada y valida." >&2
}

install -m 644 "$base_dir/novagest-proxy-headers.conf" "$dest_snippet"
install -m 644 "$base_dir/novagest-rate-limit.conf" "$dest_limite"
install -m 644 "$tmp/rutas.conf" "$dest_rutas"
install -m 644 "$tmp/$sitio" "$dest_sitio"
ln -sfn "$dest_sitio" "$link_sitio"
if [[ $tunel -eq 1 ]]; then
    install -m 644 "$tmp/$sitio_tunel" "$dest_tunel"
    ln -sfn "$dest_tunel" "$link_tunel"
fi
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
verificar_health() {
    local url=$1
    if curl -fsS -m 5 "$url" | grep -q '"status":"UP"'; then
        ok "$url responde UP a traves de Nginx"
    else
        echo "AVISO: $url no responde UP (revisar backend y error.log)." >&2
        estado=1
    fi
}
verificar_health "http://$LISTEN_IP:$LISTEN_PORT/actuator/health"
[[ $tunel -eq 1 ]] && verificar_health "http://127.0.0.1:$TUNEL_PORT/actuator/health"
codigo_443_despues="$(curl -sk -o /dev/null -m 5 -w '%{http_code}' https://127.0.0.1:443/ || true)"
if [[ "$codigo_443_despues" == "$codigo_443_antes" ]]; then
    ok "sitio existente en 443 sin cambios ($codigo_443_despues)"
else
    echo "AVISO: el sitio en 443 cambio de $codigo_443_antes a $codigo_443_despues." >&2
    estado=1
fi
systemctl is-active --quiet nginx && ok "nginx activo"
[[ $tunel -eq 1 ]] && echo "Siguiente paso (Cloudflare): apuntar el tunel de $entorno a http://127.0.0.1:$TUNEL_PORT."
echo "Revertir: sudo bash $base_dir/revertir-nginx-privado.sh $entorno"
exit $estado
