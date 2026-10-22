#!/usr/bin/env bash
set -euo pipefail

# Retira el proxy privado de un entorno. Los fragmentos comunes y la espera de
# Tailscale solo se retiran cuando ya no queda ningun sitio privado de NovaGest.
# Uso: sudo bash revertir-nginx-privado.sh staging|production

entorno="${1:-}"
case "$entorno" in
    staging|production) ;;
    *) echo "Uso: sudo bash $0 staging|production" >&2; exit 2 ;;
esac
[[ $EUID -eq 0 ]] || { echo "Ejecutar con sudo." >&2; exit 1; }

nginx -t -q || { echo "ERROR: nginx -t falla antes de revertir; revisar a mano." >&2; exit 1; }

rm -f -- "/etc/nginx/sites-enabled/novagest-$entorno-privado.conf" \
         "/etc/nginx/sites-available/novagest-$entorno-privado.conf"

if ! compgen -G "/etc/nginx/sites-enabled/novagest-*-privado.conf" > /dev/null; then
    rm -f -- /etc/nginx/conf.d/novagest-rate-limit.conf \
             /etc/nginx/snippets/novagest-proxy-headers.conf \
             /etc/systemd/system/nginx.service.d/novagest-espera-tailscale.conf
    rmdir --ignore-fail-on-non-empty /etc/systemd/system/nginx.service.d 2>/dev/null || true
    systemctl daemon-reload
fi

nginx -t
systemctl reload nginx
echo "OK: proxy privado de $entorno retirado. Respaldos previos en /root/novagest-respaldos/."
