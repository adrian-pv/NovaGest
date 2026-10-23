#!/usr/bin/env bash
set -uo pipefail

# Verifica desde fuera una instancia publicada de NovaGest (pruebas, produccion o
# la de Windows) sin credenciales ni cambios: frontend, rutas de React, salud,
# /actuator cerrado, API protegida, CORS del login, cabeceras de seguridad y
# redireccion a HTTPS. Sirve como evidencia de salida (DES-18).
#
# Uso: bash verificar-publicacion.sh https://<dominio> [--sin-frontend]
# Codigo de salida: 0 si todo pasa, 1 si algo falla.

base="${1:-}"
sin_frontend=0
[[ "${2:-}" == "--sin-frontend" ]] && sin_frontend=1
[[ "$base" =~ ^https?://[^/]+$ ]] || { echo "Uso: bash $0 https://<dominio> [--sin-frontend]" >&2; exit 2; }

fallos=0
fila() { printf '%-6s %-44s %s\n' "$1" "$2" "$3"; [[ "$1" == FALLA ]] && fallos=$((fallos + 1)); return 0; }
codigo() { curl -s -m 15 -o /dev/null -w '%{http_code}' "$@"; }
cabeceras() { curl -sI -m 15 "$1"; }
espera() {  # espera <descripcion> <obtenido> <aceptados...>
    local desc=$1 obtenido=$2; shift 2
    for ok in "$@"; do [[ "$obtenido" == "$ok" ]] && { fila OK "$desc" "$obtenido"; return; }; done
    fila FALLA "$desc" "$obtenido (se esperaba $*)"
}

echo "Verificacion de $base ($(date -u '+%Y-%m-%d %H:%M:%S UTC'))"

salud="$(curl -s -m 15 "$base/actuator/health")"
if [[ "$salud" == *'"status":"UP"'* ]]; then fila OK "/actuator/health" UP; else fila FALLA "/actuator/health" "${salud:-sin respuesta}"; fi
espera "/actuator/env cerrado" "$(codigo "$base/actuator/env")" 404
espera "/api/tramites sin sesion" "$(codigo "$base/api/tramites")" 401

if [[ $sin_frontend -eq 0 ]]; then
    espera "/ (frontend)" "$(codigo "$base/")" 200
    espera "/mis-tramites (ruta de React)" "$(codigo "$base/mis-tramites")" 200
    espera "/assets/inexistente.js" "$(codigo "$base/assets/no-existe-$$.js")" 404
    h="$(cabeceras "$base/")"
    grep -qi "^content-security-policy:.*frame-ancestors 'none'" <<<"$h" \
        && fila OK "CSP del frontend" presente || fila FALLA "CSP del frontend" ausente
    grep -qi '^x-frame-options: *DENY' <<<"$h" \
        && fila OK "X-Frame-Options" DENY || fila FALLA "X-Frame-Options" ausente
fi

origen="$base"
login() { codigo -X POST -H "Origin: $1" -H 'Content-Type: application/json' -d '{}' "$base/api/auth/login"; }
espera "login con Origin propio (CORS)" "$(login "$origen")" 400 401
espera "login con Origin ajeno" "$(login https://sitio-ajeno.example)" 403

if [[ "$base" == https://* ]]; then
    grep -qi '^strict-transport-security:' <<<"$(cabeceras "$base/actuator/health")" \
        && fila OK "HSTS en la API" presente || fila FALLA "HSTS en la API" ausente
    if [[ $sin_frontend -eq 0 ]]; then
        grep -qi '^strict-transport-security:' <<<"$(cabeceras "$base/")" \
            && fila OK "HSTS en el frontend" presente || fila FALLA "HSTS en el frontend" ausente
    fi
    http_url="http://${base#https://}/"
    red="$(curl -s -m 15 -o /dev/null -w '%{http_code} %{redirect_url}' "$http_url")"
    [[ "$red" == 30[178]\ https://* ]] && fila OK "HTTP redirige a HTTPS" "$red" || fila FALLA "HTTP redirige a HTTPS" "$red"
    saltos="$(curl -sL -m 20 --max-redirs 5 -o /dev/null -w '%{num_redirects}' "$http_url")"
    [[ "$saltos" -le 2 ]] && fila OK "sin bucle de redirecciones" "$saltos salto(s)" || fila FALLA "sin bucle de redirecciones" "$saltos"
fi

echo
if [[ $fallos -eq 0 ]]; then echo "RESULTADO: todo OK"; exit 0; fi
echo "RESULTADO: $fallos comprobacion(es) fallida(s)"
exit 1
