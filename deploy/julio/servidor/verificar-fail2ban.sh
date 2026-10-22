#!/usr/bin/env bash
set -Eeuo pipefail

# Prueba administrativa del mecanismo de bloqueo, sin provocar fallos de login.
# TEST-NET-2: esta dirección está reservada para documentación, no es el cliente.
readonly test_ip='198.51.100.254'
[[ ${EUID} -eq 0 ]] || { printf 'Ejecuta con sudo.\n' >&2; exit 1; }
for tool in fail2ban-client nft python3 systemctl; do
  command -v "$tool" >/dev/null || { printf 'Falta %s\n' "$tool" >&2; exit 1; }
done
systemctl is-active --quiet fail2ban
systemctl is-enabled --quiet fail2ban
fail2ban-client status sshd

# No retirar un bloqueo que ya existiese antes de esta prueba.
existing=$(fail2ban-client get sshd banip)
if printf '%s\n' "$existing" | grep -Eq '(^|[[:space:]])198\.51\.100\.254([[:space:]]|$)'; then
  printf 'La IP de prueba ya estaba bloqueada; no modificaré ese estado.\n' >&2
  exit 1
fi

cleanup() {
  local result=$?
  trap - EXIT
  if ! fail2ban-client set sshd unbanip "$test_ip"; then
    printf 'ERROR: retirar manualmente la IP de prueba: sudo fail2ban-client set sshd unbanip %s\n' "$test_ip" >&2
    exit 1
  fi
  for _ in {1..20}; do
    if ! nft list table inet f2b-table 2>/dev/null | grep -Fq "$test_ip"; then
      break
    fi
    sleep 0.25
  done
  if nft list table inet f2b-table 2>/dev/null | grep -Fq "$test_ip"; then
    printf 'ERROR: la IP de prueba sigue en nftables; revisar el estado de la acción.\n' >&2
    exit 1
  fi
  if [[ "$result" -eq 0 ]]; then
    printf 'OK: bloqueo nftables creado, verificado y retirado.\n'
  fi
  exit "$result"
}
trap cleanup EXIT
fail2ban-client set sshd banip "$test_ip"
for _ in {1..20}; do
  if nft list table inet f2b-table 2>/dev/null | grep -Fq "$test_ip"; then
    break
  fi
  sleep 0.25
done

# Leer solo la tabla propia de Fail2ban; no modificar ni vaciar otras tablas.
nft -j list table inet f2b-table | python3 -c '
import json, sys
data = json.load(sys.stdin)
entries = data["nftables"]
sets = [item["set"] for item in entries if "set" in item]
matching = []
for entry in sets:
    if "198.51.100.254" in entry.get("elem", []):
        matching.append(entry["name"])
if not matching:
    raise SystemExit("ERROR: IP de prueba no encontrada en el conjunto nftables")
chains = [item["chain"] for item in entries if "chain" in item]
rules = [item["rule"] for item in entries if "rule" in item]
for rule in rules:
    expression = json.dumps(rule.get("expr", []))
    if not any("@" + name in expression for name in matching):
        continue
    chain = next((c for c in chains if c["name"] == rule["chain"]), {})
    if chain.get("hook") == "input" and chain.get("prio", 0) < 0 and "reject" in expression:
        print("OK: IP presente en conjunto de rechazo y cadena input con prioridad", chain["prio"])
        break
else:
    raise SystemExit("ERROR: no se encontró regla de rechazo con prioridad anterior al filtro estándar")
'
