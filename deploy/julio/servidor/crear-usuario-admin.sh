#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOT'
Uso: sudo bash crear-usuario-admin.sh --aplicar --usuario NOMBRE \
       --clave-publica /ruta/llave.pub [--nombre-completo "Nombre Apellido"]

Crea un usuario local administrativo personal, lo agrega a sudo, instala la
llave pública validada e inicia el diálogo interactivo para que la persona
elija su contraseña. No cambia ni elimina otras cuentas.
EOT
}

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

apply=false
user=''
key_file=''
full_name=''
while (($#)); do
  case "$1" in
    --aplicar) apply=true; shift ;;
    --usuario) [[ $# -ge 2 ]] || { usage; exit 2; }; user=$2; shift 2 ;;
    --clave-publica) [[ $# -ge 2 ]] || { usage; exit 2; }; key_file=$2; shift 2 ;;
    --nombre-completo) [[ $# -ge 2 ]] || { usage; exit 2; }; full_name=$2; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) usage; exit 2 ;;
  esac
done
[[ "$apply" == true && -n "$user" && -n "$key_file" ]] || { usage; exit 2; }
[[ "$user" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] || die 'Nombre de usuario inválido (minúsculas, dígitos, _ y -).'
[[ -n "$full_name" ]] || full_name=$user
[[ "$full_name" != *:* && "$full_name" != *,* ]] || die 'El nombre completo no puede contener ":" ni ",".'

[[ ${EUID} -eq 0 ]] || die 'Ejecuta como root, p. ej. con sudo.'
[[ -t 0 && -t 1 ]] || die 'Se requiere una terminal interactiva para que la persona defina su contraseña.'
[[ -f "$key_file" && ! -L "$key_file" && -r "$key_file" ]] || die 'La llave pública debe ser un archivo regular, legible y no ser un enlace simbólico.'
getent passwd "$user" >/dev/null && die "El usuario $user ya existe; no modificaré cuentas existentes."
getent group sudo >/dev/null || die 'No existe el grupo sudo.'
command -v adduser >/dev/null || die 'No se encontró adduser.'
command -v usermod >/dev/null || die 'No se encontró usermod.'
command -v ssh-keygen >/dev/null || die 'No se encontró ssh-keygen.'
ssh-keygen -l -f "$key_file" >/dev/null || die 'ssh-keygen no pudo validar la llave pública.'

printf 'Llave pública validada:\n'
ssh-keygen -l -f "$key_file"
printf '\nSe creará el usuario %s y se agregará a sudo. La persona definirá su contraseña en el siguiente diálogo.\n' "$user"

adduser --disabled-password --gecos "$full_name" "$user"
usermod -aG sudo "$user"
install -d -o "$user" -g "$user" -m 0700 "/home/$user/.ssh"
install -o "$user" -g "$user" -m 0600 "$key_file" "/home/$user/.ssh/authorized_keys"
passwd "$user"

printf '\nCuenta %s preparada. Desde otra terminal, verifica SSH y sudo antes de usarla para administración.\n' "$user"
