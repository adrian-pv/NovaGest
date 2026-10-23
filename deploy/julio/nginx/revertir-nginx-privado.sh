#!/usr/bin/env bash
set -euo pipefail

# Retira el proxy de un entorno (acceso privado, origen del tunel y sus rutas).
# Los fragmentos comunes y la espera de Tailscale solo se retiran cuando ya no
# queda ningun sitio de NovaGest. Antes de retirar el origen del tunel, el tunel
# de Cloudflare debe apuntar a otro destino o respondera 502.
# Uso: sudo bash revertir-nginx-privado.sh staging|production

entorno="${1:-}"
case "$entorno" in
    staging|production) ;;
    *) echo "Uso: sudo bash $0 staging|production" >&2; exit 2 ;;
esac
[[ $EUID -eq 0 ]] || { echo "Ejecutar con sudo." >&2; exit 1; }

nginx -t -q || { echo "ERROR: nginx -t falla antes de revertir; revisar a mano." >&2; exit 1; }

for sitio in privado tunel; do
    rm -f -- "/etc/nginx/sites-enabled/novagest-$entorno-$sitio.conf" \
             "/etc/nginx/sites-available/novagest-$entorno-$sitio.conf"
done
rm -f -- "/etc/nginx/snippets/novagest-$entorno-rutas.conf"

if ! compgen -G "/etc/nginx/sites-enabled/novagest-*.conf" > /dev/null; then
    rm -f -- /etc/nginx/conf.d/novagest-rate-limit.conf \
             /etc/nginx/snippets/novagest-proxy-headers.conf \
             /etc/systemd/system/nginx.service.d/novagest-espera-tailscale.conf \
             /etc/sysctl.d/60-novagest-nonlocal-bind.conf
    rmdir --ignore-fail-on-non-empty /etc/systemd/system/nginx.service.d 2>/dev/null || true
    sysctl -q -w net.ipv4.ip_nonlocal_bind=0
    systemctl daemon-reload
fi

nginx -t
systemctl reload nginx
echo "OK: proxy de $entorno retirado. Respaldos previos en /root/novagest-respaldos/."
