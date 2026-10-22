#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_NAME=${0##*/}
readonly DEV_GROUP=novagest-dev
readonly DEPLOY_GROUP=novagest-deploy
readonly SUDO_GROUP=sudo
# Las listas se llenan desde el archivo de cuentas (--archivo).
declare -a DEV_USERS=()
declare -a DEPLOY_USERS=()
declare -a ALL_USERS=()
declare -A GECOS_OF=()
declare -a CHECK_SUDO_USERS=()

mode=plan
accounts_file=''

usage() {
  cat <<EOF
Uso:
  bash $SCRIPT_NAME --archivo CUENTAS [--plan] [--revisar-sudo USUARIO]...
  sudo bash $SCRIPT_NAME --archivo CUENTAS --aplicar [--revisar-sudo USUARIO]...
  sudo bash $SCRIPT_NAME --archivo CUENTAS --completar-bloqueadas

CUENTAS es un archivo de texto con una cuenta por línea (# comenta):
  usuario:rol[:nombre completo]
Roles: dev (grupo $DEV_GROUP, sin sudo) y deploy (grupos $DEPLOY_GROUP y
$SUDO_GROUP). Ver cuentas-equipo.muestra.txt.

Por defecto solo muestra el plan. --aplicar requiere root y crea las cuentas
locales sin contraseña ni llaves SSH. Las cuentas usan /bin/bash y
/home/<usuario>; sus claves SSH autorizadas quedan vacías. El script no asigna
grupos docker ni concede permisos sobre el proyecto o archivos de entorno. No
crea ni modifica cuentas preexistentes. --revisar-sudo USUARIO (repetible)
solo informa los permisos sudo de una identidad ya existente (p. ej. una
cuenta de dominio) sin modificarla. El modo de recuperación
--completar-bloqueadas solo agrega grupos a las cuentas del archivo si ya
existen, siguen con contraseña bloqueada y authorized_keys vacío.
EOF
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

declare -a created_users=()
declare -a managed_users=()
declare -a added_memberships=()
attempting_user=''
applying=false

on_exit() {
  local rc=$?
  trap - EXIT
  if [[ "$applying" == true && $rc -ne 0 ]]; then
    local i pair member group
    for ((i=${#added_memberships[@]}-1; i>=0; i--)); do
      pair=${added_memberships[i]}
      member=${pair%%:*}
      group=${pair#*:}
      if ! gpasswd -d "$member" "$group" >/dev/null 2>&1; then
        printf 'AVISO: no se pudo retirar el grupo %s de %s; verifica esa membresía manualmente.\n' "$group" "$member" >&2
      fi
    done
    if [[ -n "$attempting_user" ]]; then
      printf 'ERROR: falló la preparación de %s. La cuenta podría existir de forma parcial; no se elimina ni se recrea.\n' "$attempting_user" >&2
    fi
    if (( ${#created_users[@]} > 0 )); then
      printf 'Cuentas creadas que se conservaron: %s. No se asignaron privilegios restantes.\n' "${created_users[*]}" >&2
    fi
  fi
  exit "$rc"
}
trap on_exit EXIT

while (($#)); do
  case "$1" in
    --plan)
      [[ "$mode" == plan ]] || die 'No combines --plan con --aplicar.'
      mode=plan
      ;;
    --aplicar)
      [[ "$mode" == plan ]] || die 'Usa solo uno de --plan, --aplicar o --completar-bloqueadas.'
      mode=apply
      ;;
    --completar-bloqueadas)
      [[ "$mode" == plan ]] || die 'Usa solo uno de --plan, --aplicar o --completar-bloqueadas.'
      mode=resume
      ;;
    --archivo)
      [[ $# -ge 2 ]] || die '--archivo requiere una ruta.'
      accounts_file=$2
      shift
      ;;
    --revisar-sudo)
      [[ $# -ge 2 ]] || die '--revisar-sudo requiere un nombre.'
      CHECK_SUDO_USERS+=("$2")
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      die "Opción desconocida: $1"
      ;;
  esac
  shift
done

[[ -n "$accounts_file" ]] || { usage >&2; die 'Falta --archivo con la lista de cuentas.'; }
[[ -f "$accounts_file" && -r "$accounts_file" ]] || die "No se puede leer el archivo de cuentas: $accounts_file"

load_accounts() {
  local line user role name lineno=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    lineno=$((lineno + 1))
    line=${line%$'\r'}
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    IFS=: read -r user role name <<< "$line"
    [[ "$user" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] || die "Línea $lineno: nombre de usuario inválido."
    case "$role" in
      dev) DEV_USERS+=("$user") ;;
      deploy) DEPLOY_USERS+=("$user") ;;
      *) die "Línea $lineno: rol inválido (use dev o deploy)." ;;
    esac
    [[ " ${ALL_USERS[*]:-} " != *" $user "* ]] || die "Línea $lineno: usuario repetido: $user."
    ALL_USERS+=("$user")
    GECOS_OF[$user]=${name:-$user}
  done < "$accounts_file"
  (( ${#ALL_USERS[@]} > 0 )) || die 'El archivo de cuentas no define ninguna cuenta.'
}
load_accounts

local_passwd_line() {
  awk -F: -v name="$1" '$1 == name { print; found=1 } END { if (!found) exit 1 }' /etc/passwd
}

local_group_line() {
  awk -F: -v name="$1" '$1 == name { print; found=1 } END { if (!found) exit 1 }' /etc/group
}

# Detecta nombres cortos y cuentas con prefijo de dominio o sufijo UPN.
nss_user_matches() {
  { getent passwd "$1" || true; getent passwd || true; } | awk -F: -v name="${1,,}" '{
    login = tolower($1)
    sub(/^.*\\/, "", login)
    sub(/@.*$/, "", login)
    if (login == name) print $1
  }' | sort -u
}

preflight_user() {
  local user=$1 line passwd_field uid home shell external
  if line=$(local_passwd_line "$user"); then
    IFS=: read -r passwd_field _ uid _ _ home shell <<< "$line"
    [[ "$uid" =~ ^[0-9]+$ ]] || die "UID inválido para la cuenta local $user."
    ((uid >= 1000)) || die "La cuenta local $user existe con UID $uid; se esperaba UID >= 1000."
    [[ "$home" == "/home/$user" ]] || die "La cuenta local $user existe con home $home; se esperaba /home/$user."
    [[ "$shell" == /bin/bash ]] || die "La cuenta local $user existe con shell $shell; se esperaba /bin/bash."
    external=$(nss_user_matches "$user" | awk -F: -v local="$user" '$1 != local { print $1 }')
    [[ -z "$external" ]] || die "Hay otra identidad NSS que colisiona con $user: $external. No se modificará ninguna cuenta."
    printf 'EXISTE local compatible: %s (UID %s, home %s, shell %s); no se modificará.\n' "$user" "$uid" "$home" "$shell"
  else
    external=$(nss_user_matches "$user")
    [[ -z "$external" ]] || die "El nombre $user ya resuelve en NSS ($external), pero no es una cuenta local; no crearé una cuenta que la oculte."
    [[ ! -e "/home/$user" && ! -L "/home/$user" ]] || die "Ya existe /home/$user; no modificaré ese directorio ni un enlace preexistente."
    [[ -z "$(getent group "$user" || true)" ]] || die "Ya existe un grupo llamado $user sin la cuenta local esperada; revisar antes de crear."
    printf 'NUEVA cuenta local: %s (UID asignado por el sistema, /home/%s, /bin/bash).\n' "$user" "$user"
  fi
}

preflight_group() {
  local group=$1 local_line global_line
  if local_line=$(local_group_line "$group"); then
    global_line=$(getent group "$group" || true)
    [[ -n "$global_line" ]] || die "El grupo local $group no aparece en NSS; revisa la configuración de grupos."
    printf 'EXISTE grupo local: %s.\n' "$group"
  else
    global_line=$(getent group "$group" || true)
    [[ -z "$global_line" ]] || die "El grupo $group existe en NSS pero no localmente; no crearé una colisión."
    printf 'NUEVO grupo local: %s.\n' "$group"
  fi
}

check_developer_sudo() {
  local user=$1 listing
  listing=$(LC_ALL=C sudo -l -U "$user" 2>&1) || true
  # sudo-rs puede devolver éxito al listar una denegación. Exigir el mensaje
  # explícito de denegación; un error o una salida desconocida no prueba nada.
  if [[ ! "$listing" =~ ^User\ ${user}\ is\ not\ allowed\ to\ run\ sudo\ on\ [^[:space:]]+\.$ ]]; then
    printf '%s\n' "$listing" >&2
    die "No se confirmó la denegación explícita de sudo para $user. Revisar antes de continuar."
  fi
  printf 'Sin autorización sudo efectiva detectada para %s.\n' "$user"
}

report_existing_sudo() {
  local name=$1 identities identity
  identities=$(nss_user_matches "$name" || true)
  if [[ -z "$identities" ]]; then
    printf 'Revisión sudo: no se encontró identidad NSS para %s; queda pendiente de verificar.\n' "$name"
    return
  fi
  while IFS= read -r identity; do
    [[ -n "$identity" ]] || continue
    printf '\nPermisos declarados por sudo para %s, sin modificar la cuenta:\n' "$identity"
    LC_ALL=C sudo -l -U "$identity" || printf 'Consulta de permisos incompleta; revisar con la persona responsable.\n'
  done <<< "$identities"
}

command -v getent >/dev/null || die 'No se encontró getent.'
command -v awk >/dev/null || die 'No se encontró awk.'

if [[ "$mode" != plan ]]; then
  [[ $EUID -eq 0 ]] || die 'Para aplicar cambios, ejecuta el script como root (p. ej., sudo bash $SCRIPT_NAME --archivo CUENTAS --aplicar).'
  for command_name in adduser groupadd usermod gpasswd install passwd sudo sort stat; do
    command -v "$command_name" >/dev/null || die "No se encontró el comando requerido: $command_name."
  done
  applying=true
fi

printf 'Preflight de cuentas locales del equipo:\n'
for user in "${ALL_USERS[@]}"; do
  preflight_user "$user"
done

printf '\nPreflight de grupos:\n'
preflight_group "$DEV_GROUP"
preflight_group "$DEPLOY_GROUP"
if ! local_group_line "$SUDO_GROUP" >/dev/null; then
  global_sudo=$(getent group "$SUDO_GROUP" || true)
  [[ -z "$global_sudo" ]] || die "El grupo $SUDO_GROUP existe en NSS pero no localmente."
  die "No existe el grupo local $SUDO_GROUP requerido para las cuentas deploy."
fi
getent group "$SUDO_GROUP" >/dev/null || die "El grupo local $SUDO_GROUP no aparece en NSS."
printf 'EXISTE grupo local requerido: %s.\n' "$SUDO_GROUP"

if [[ "$mode" == plan ]]; then
  printf '\nPlan listo. No se cambió el sistema. Para aplicar, usa sudo bash %s --archivo CUENTAS --aplicar.\n' "$SCRIPT_NAME"
  exit 0
fi

if [[ "$mode" == resume ]]; then
  for user in "${ALL_USERS[@]}"; do
    local_passwd_line "$user" >/dev/null || die "Falta la cuenta local $user; recuperación cancelada."
    status=$(LC_ALL=C passwd -S "$user")
    read -r _ password_status _ <<< "$status"
    [[ "$password_status" == L ]] || die "$user ya no tiene contraseña bloqueada; no cambiaré sus grupos."
    for path in "/home/$user" "/home/$user/.ssh"; do
      [[ -d "$path" && ! -L "$path" && "$(stat -c %U "$path")" == "$user" ]] || die "Directorio inesperado: $path."
    done
    path="/home/$user/.ssh/authorized_keys"
    [[ -f "$path" && ! -L "$path" && ! -s "$path" && "$(stat -c %U "$path")" == "$user" ]] || die "Llaves o propietario inesperados en $path; no modificaré la cuenta."
    managed_users+=("$user")
  done
fi

# Valida cuentas anteriores antes de crear nada; no las modifica.
for user in "${DEV_USERS[@]}"; do
  if local_passwd_line "$user" >/dev/null; then
    check_developer_sudo "$user"
  fi
done

printf '\nAplicando cambios. Las cuentas nuevas quedarán sin contraseña y sin llaves autorizadas.\n'
for group in "$DEV_GROUP" "$DEPLOY_GROUP"; do
  if ! local_group_line "$group" >/dev/null; then
    groupadd "$group"
  fi
done

for user in "${ALL_USERS[@]}"; do
  if local_passwd_line "$user" >/dev/null; then
    continue
  fi

  attempting_user=$user
  gecos=${GECOS_OF[$user]}
  adduser --disabled-password --no-create-home --gecos "$gecos" --shell /bin/bash "$user"
  created_users+=("$user")
  managed_users+=("$user")
  install -d -o "$user" -g "$user" -m 0750 "/home/$user"
  install -d -o "$user" -g "$user" -m 0700 "/home/$user/.ssh"
  install -o "$user" -g "$user" -m 0600 /dev/null "/home/$user/.ssh/authorized_keys"
  status=$(passwd -S "$user")
  read -r _ password_status _ <<< "$status"
  [[ "$password_status" == L ]] || die "La contraseña de $user no quedó bloqueada (passwd -S); no asignaré privilegios."
  [[ -f "/home/$user/.ssh/authorized_keys" && ! -s "/home/$user/.ssh/authorized_keys" ]] || die "authorized_keys de $user no está vacío."
  preflight_user "$user" >/dev/null
  attempting_user=''
  printf 'Cuenta preparada y bloqueada: %s; authorized_keys está vacío.\n' "$user"
done

# Comprueba sudo efectivo antes de agregar cualquier grupo a cuentas nuevas.
for user in "${DEV_USERS[@]}"; do
  if [[ " ${managed_users[*]} " == *" $user "* ]]; then
    check_developer_sudo "$user"
  fi
done

add_membership() {
  local user=$1 group=$2
  if id -nG "$user" | tr ' ' '\n' | grep -Fxq "$group"; then
    printf 'Membresía ya existente, conservada: %s -> %s.\n' "$user" "$group"
    return
  fi
  usermod -aG "$group" "$user"
  added_memberships+=("$user:$group")
  printf 'Membresía asignada: %s -> %s.\n' "$user" "$group"
}

# Solo cuentas nuevas o explícitamente verificadas en recuperación.
for user in "${DEV_USERS[@]}"; do
  if [[ " ${managed_users[*]} " == *" $user "* ]]; then
    add_membership "$user" "$DEV_GROUP"
  fi
done
for user in "${DEPLOY_USERS[@]}"; do
  if [[ " ${managed_users[*]} " == *" $user "* ]]; then
    add_membership "$user" "$DEPLOY_GROUP"
    add_membership "$user" "$SUDO_GROUP"
  fi
done

for user in "${DEV_USERS[@]}"; do
  check_developer_sudo "$user"
done
printf '\nIdentidades locales resultantes:\n'
for user in "${ALL_USERS[@]}"; do
  id "$user"
done
for name in "${CHECK_SUDO_USERS[@]}"; do
  report_existing_sudo "$name"
done
printf '\nCuentas preparadas. Los usuarios de desarrollo no recibieron sudo.\n'
printf 'Las cuentas gestionadas de desarrollo usan %s; las cuentas deploy usan %s y %s. No se asignaron grupos docker ni permisos sobre el proyecto.\n' "$DEV_GROUP" "$DEPLOY_GROUP" "$SUDO_GROUP"
printf 'Instala llaves SSH verificadas en un paso posterior; no se copió ninguna llave.\n'
