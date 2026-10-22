#!/usr/bin/env bash
set -u

section() { printf '\n===== %s =====\n' "$1"; }
run() {
  printf '\n$'
  printf ' %q' "$@"
  printf '\n'
  "$@" 2>&1 || printf '[comando terminó con código %s]\n' "$?"
}
have() { command -v "$1" >/dev/null 2>&1; }

section 'Fecha y sistema'
run date --iso-8601=seconds
run hostnamectl
run uname -a
if [[ -r /etc/os-release ]]; then
  run cat /etc/os-release
fi

section 'Identidad y acceso administrativo (sin secretos)'
run id
if have getent; then run getent group sudo; fi
if have sshd; then
  run sshd -T
else
  printf 'sshd no está en PATH.\n'
fi
if have systemctl; then
  run systemctl status ssh.service --no-pager --full
  run systemctl status sshd.service --no-pager --full
fi

section 'Firewall (solo lectura)'
if have ufw; then run ufw status verbose; else printf 'ufw no instalado.\n'; fi
if have nft; then run nft list ruleset; else printf 'nft no instalado.\n'; fi
if have iptables-save; then run iptables-save; else printf 'iptables-save no instalado.\n'; fi

section 'Interfaces y rutas'
if have ip; then
  run ip -brief address
  run ip route show table all
else
  printf 'ip no está en PATH.\n'
fi
if have tailscale; then run tailscale status; else printf 'tailscale CLI no instalado.\n'; fi

section 'Sockets en escucha'
if have ss; then run ss -lntup; else printf 'ss no está en PATH.\n'; fi

section 'Servicios relevantes'
if have systemctl; then
  for unit in nginx docker unattended-upgrades samba-ad-dc smbd nmbd bind9 named isc-dhcp-server kea-dhcp4-server postfix dovecot squid ssh fail2ban; do
    run systemctl is-active "$unit.service"
    run systemctl is-enabled "$unit.service"
  done
  run systemctl list-units --type=service --state=running --no-pager
fi

section 'Paquetes de seguridad instalados'
if have dpkg-query; then
  run dpkg-query -W -f='${binary:Package}\t${Version}\t${db:Status-Abbrev}\n' openssh-server ufw fail2ban unattended-upgrades
fi

printf '\nAuditoría terminada. Los comandos de firewall fueron consultas; no se aplicaron cambios.\n'
