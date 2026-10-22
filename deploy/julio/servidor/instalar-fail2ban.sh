#!/usr/bin/env bash
set -Eeuo pipefail

readonly state_dir='/var/lib/novagest-hardening/fail2ban'
readonly jail_file='/etc/fail2ban/jail.d/60-novagest-sshd.local'

usage() {
  cat <<'EOF'
Uso: sudo bash instalar-fail2ban.sh --aplicar

Instala Fail2ban y habilita una cárcel SSH local después de validar la configuración.
Fail2ban puede insertar reglas temporales de bloqueo en netfilter; no activa UFW.
EOF
}

die() { printf 'ERROR: %s\n' "$*" >&2; return 1; }

[[ ${EUID} -eq 0 ]] || die 'Ejecuta como root, p. ej. con sudo.'
[[ ${1:-} == '--aplicar' && $# -eq 1 ]] || { usage; exit 2; }
command -v apt-get >/dev/null || die 'No se encontró apt-get.'
command -v systemctl >/dev/null || die 'Se requiere systemd.'
command -v sshd >/dev/null || die 'No se encontró sshd; no puedo validar la cárcel.'
systemctl list-unit-files ssh.service sshd.service --no-legend 2>/dev/null | grep -Eq '^(ssh|sshd)\.service' || die 'No se encontró una unidad SSH de systemd.'
if dpkg-query -W -f='${db:Status-Status}' fail2ban 2>/dev/null | grep -qx 'installed'; then
  die 'Fail2ban ya está instalado; no reiniciaré ni modificaré una instalación existente.'
fi
if command -v fail2ban-client >/dev/null 2>&1 || systemctl list-unit-files fail2ban.service --no-legend 2>/dev/null | grep -q '^fail2ban\.service'; then
  die 'Se detectó una instalación o unidad Fail2ban preexistente; no la modificaré.'
fi
[[ ! -e /etc/fail2ban ]] || die 'Ya existe configuración en /etc/fail2ban; no la modificaré.'
[[ ! -e "$state_dir" ]] || die "Ya existe estado de operación en $state_dir; revierte o inspecciona antes de continuar."
[[ ! -e "$jail_file" ]] || die "$jail_file ya existe; no lo sobrescribiré."

cat <<'EOF'
Esto instalará Fail2ban y activará una cárcel para SSH con 5 intentos,
ventana de 10 minutos y bloqueo de 10 minutos. No se configurará una
lista de exclusión para Tailscale ni se cambiará la política de UFW.

Confirma que tienes una vía alternativa de administración y que conoces
las redes desde las que se conecta el equipo. La cuenta compartida puede
provocar bloqueos que afecten a varias personas.
EOF
cleanup_on_error() {
  local status=$?
  trap - ERR
  if [[ -f "$state_dir/transaction-started" ]]; then
    printf 'Falló la aplicación; intentando restaurar configuración y servicio (el paquete puede permanecer instalado)...\n' >&2
    if [[ -f "$(dirname "$0")/revertir-fail2ban.sh" ]]; then
      bash "$(dirname "$0")/revertir-fail2ban.sh" --interno || true
    else
      printf 'Ejecuta manualmente: sudo bash revertir-fail2ban.sh\n' >&2
    fi
  elif [[ -d "$state_dir" ]]; then
    # Todavía no comenzó apt ni se modificó el servicio. Retirar únicamente
    # los archivos de estado que pudo crear esta preparación incompleta.
    rm -f -- "$state_dir/was-enabled" "$state_dir/was-active" || true
    rmdir -- "$state_dir" || true
  fi
  exit "$status"
}
trap cleanup_on_error ERR
install -d -m 0700 "$state_dir"

service_was_enabled=0
service_was_active=0
if systemctl is-enabled --quiet fail2ban.service 2>/dev/null; then service_was_enabled=1; fi
if systemctl is-active --quiet fail2ban.service 2>/dev/null; then service_was_active=1; fi
printf '%s\n' "$service_was_enabled" > "$state_dir/was-enabled"
printf '%s\n' "$service_was_active" > "$state_dir/was-active"
chmod 0600 "$state_dir/was-enabled" "$state_dir/was-active"
touch "$state_dir/transaction-started"

# Evitar que el postinst del paquete inicie el servicio con la configuración
# por defecto antes de validar nuestra cárcel. La máscara solo vive en /run.
touch "$state_dir/runtime-mask"
systemctl mask --runtime fail2ban.service
apt-get install -y fail2ban

install -d -m 0755 /etc/fail2ban/jail.d
cat > "$jail_file" <<'EOF'
# Administrado por Novagest: retirar con revertir-fail2ban.sh.
[sshd]
enabled = true
backend = systemd
banaction = nftables-multiport
port = ssh
maxretry = 5
findtime = 10m
bantime = 10m
EOF
chmod 0644 "$jail_file"

fail2ban-client -t
systemctl unmask --runtime fail2ban.service
rm -f -- "$state_dir/runtime-mask"
systemctl enable --now fail2ban.service
ready=0
for _ in {1..15}; do
  if systemctl is-active --quiet fail2ban.service && fail2ban-client ping >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
[[ "$ready" == 1 ]] || die 'Fail2ban no respondió dentro de 15 segundos.'
fail2ban-client status sshd

touch "$state_dir/applied"
rm -f "$state_dir/transaction-started"
trap - ERR
printf '\nFail2ban quedó activo. Revisa el estado y prueba otra conexión SSH antes de cerrar esta sesión.\n'
printf 'Para revertir la configuración: sudo bash %s/revertir-fail2ban.sh\n' "$(dirname "$0")"
