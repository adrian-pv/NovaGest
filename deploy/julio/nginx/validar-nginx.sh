#!/usr/bin/env bash
set -euo pipefail

# Valida la plantilla privada con puertos e IP loopback temporales. No necesita
# sudo, no toca la configuracion activa y elimina sus archivos temporales al salir.
base_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
nginx_bin="${NGINX_BIN:-nginx}"
tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/novagest-nginx-check.XXXXXX")"
trap 'rm -rf -- "$tmp_dir"' EXIT

mkdir -p "$tmp_dir/conf" "$tmp_dir/snippets"
cp "$base_dir/novagest-proxy-headers.conf" "$tmp_dir/snippets/novagest-proxy-headers.conf"

# Renderizar solo variables de la plantilla para no alterar variables propias de nginx.
variables='${LISTEN_IP} ${LISTEN_PORT} ${TUNEL_PORT} ${BACKEND_PORT} ${FRONTEND_ROOT} ${NG_ENTORNO}'
for entorno in production staging; do
    case "$entorno" in
        production) export LISTEN_PORT=18082 TUNEL_PORT=18182 ;;
        staging)    export LISTEN_PORT=18083 TUNEL_PORT=18183 ;;
    esac
    export LISTEN_IP=127.0.0.1 BACKEND_PORT=1 FRONTEND_ROOT="$tmp_dir/www-$entorno" NG_ENTORNO="$entorno"
    envsubst "$variables" < "$base_dir/novagest-rutas.conf.template" \
        > "$tmp_dir/snippets/novagest-$entorno-rutas.conf"
    for sitio in privado tunel; do
        envsubst "$variables" < "$base_dir/novagest-$sitio.conf.template" \
            > "$tmp_dir/conf/novagest-$entorno-$sitio.conf"
    done
done

cat > "$tmp_dir/nginx.conf" <<EOF
worker_processes 1;
pid $tmp_dir/nginx.pid;
error_log $tmp_dir/error.log notice;
events { worker_connections 64; }
http {
    access_log off;
    include "$base_dir/novagest-rate-limit.conf";
    include $tmp_dir/conf/*.conf;
}
EOF

# Ajustar los includes absolutos de snippets para que apunten al arbol temporal.
sed -i -e "s|/etc/nginx/snippets/|$tmp_dir/snippets/|g" \
    -e "s|/var/log/nginx/|$tmp_dir/|g" "$tmp_dir"/conf/*.conf "$tmp_dir"/snippets/*-rutas.conf

"$nginx_bin" -t -p "$tmp_dir/" -c "$tmp_dir/nginx.conf"
