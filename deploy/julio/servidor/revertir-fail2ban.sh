#!/usr/bin/env bash
set -Eeuo pipefail

readonly state_dir='/var/lib/novagest-hardening/fail2ban'
readonly jail_file='/etc/fail2ban/jail.d/60-novagest-sshd.local'

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ ${EUID} -eq 0 ]] || die 'Ejecuta como root, p. ej. con sudo.'
[[ ${1:-} == '' || ${1:-} == '--interno' ]] || die 'Argumento no reconocido.'
[[ -d "$state_dir" ]] || die "No hay estado previo guardado en $state_dir."
[[ -f "$state_dir/was-enabled" && -f "$state_dir/was-active" ]] || die 'El respaldo de estado está incompleto; no modificaré el servicio.'

was_enabled=$(<"$state_dir/was-enabled")
was_active=$(<"$state_dir/was-active")
[[ "$was_enabled" == 0 || "$was_enabled" == 1 ]] || die 'Valor de respaldo inválido: was-enabled.'
[[ "$was_active" == 0 || "$was_active" == 1 ]] || die 'Valor de respaldo inválido: was-active.'

if [[ -f "$state_dir/runtime-mask" ]]; then
  systemctl unmask --runtime fail2ban.service
fi

if [[ -e "$jail_file" ]]; then
  grep -Fq '# Administrado por Novagest: retirar con revertir-fail2ban.sh.' "$jail_file" || die "El archivo $jail_file cambió o no pertenece a este instalador; consérvalo y revísalo manualmente."
  rm -f -- "$jail_file"
fi
if systemctl list-unit-files fail2ban.service --no-legend 2>/dev/null | grep -q '^fail2ban\.service'; then
  if [[ "$was_active" == 1 ]]; then
    systemctl restart fail2ban.service
  else
    systemctl stop fail2ban.service 2>/dev/null || true
  fi
  if [[ "$was_enabled" == 1 ]]; then
    systemctl enable fail2ban.service
  else
    systemctl disable fail2ban.service
  fi
fi

rm -f -- "$state_dir/was-enabled" "$state_dir/was-active" "$state_dir/applied" "$state_dir/transaction-started" "$state_dir/runtime-mask"
rmdir -- "$state_dir"
printf 'Se quitó %s y se restauró el estado registrado del servicio. El paquete Fail2ban permanece instalado.\n' "$jail_file"
