# Administración y endurecimiento del servidor Linux

Scripts para preparar la administración de un servidor Ubuntu. Todos los valores específicos (IP, hostname, cuentas) se pasan por argumentos o archivos; nada del entorno real está fijo en el repositorio. El estado verificado del servidor vive en un repositorio privado del equipo.

Antes de aplicar cualquier cambio, confirmar el estado actual con la auditoría: los datos de contexto no sustituyen una revisión reciente.

## Orden sugerido

1. `auditar-servidor.sh`: fotografía de solo lectura del estado.
2. `crear-usuario-admin.sh`: cuenta administrativa personal. Verificar SSH y `sudo` en una sesión nueva antes de depender de ella. No modificar ni deshabilitar cuentas compartidas durante este paso.
3. `instalar-fail2ban.sh` (opcional), desde una sesión estable. No combinar con cambios de SSH o firewall.
4. Diseñar el firewall con los responsables de cada servicio antes de activarlo.

## Scripts

- `auditar-servidor.sh`: consultas de solo lectura sobre SSH, firewall, interfaces, sockets y servicios. Algunos comandos necesitan root. Uso: `sudo bash auditar-servidor.sh > auditoria-protegida.log 2>&1`.
- `crear-usuario-admin.sh`: crea un usuario local con sudo y llave pública.

  ```bash
  sudo bash crear-usuario-admin.sh --aplicar --usuario <USUARIO> \
       --clave-publica /ruta/llave.pub [--nombre-completo "<NOMBRE>"]
  ```

  La persona elige su contraseña en el diálogo interactivo de `passwd` (el script no la recibe ni la registra). Aborta si el usuario ya existe, si la llave no valida o si no hay terminal.
- `crear-cuentas-equipo.sh`: plan y creación explícita de cuentas locales bloqueadas (sin contraseña ni llaves). Lee las cuentas de un archivo:

  ```bash
  bash crear-cuentas-equipo.sh --archivo cuentas.txt                       # plan, no cambia nada
  sudo bash crear-cuentas-equipo.sh --archivo cuentas.txt --aplicar [--revisar-sudo <USUARIO>]...
  sudo bash crear-cuentas-equipo.sh --archivo cuentas.txt --completar-bloqueadas
  ```

  Formato del archivo: `usuario:rol[:nombre completo]`, un registro por línea. Roles: `dev` (grupo `novagest-dev`, sin sudo) y `deploy` (grupos `novagest-deploy` y `sudo`). Ver `cuentas-equipo.muestra.txt`, con nombres ficticios; el archivo real debe guardarse fuera del repositorio. El script no toca cuentas preexistentes, detecta colisiones con identidades NSS y de dominio (formatos `DOMINIO\usuario` y `usuario@dominio`) y comprueba con `LC_ALL=C sudo -l -U` que las cuentas `dev` no tengan sudo: exige el mensaje explícito "is not allowed to run sudo" y se detiene ante cualquier otra salida. `--revisar-sudo` (repetible) solo informa los permisos de una identidad existente, sin modificarla.
- `instalar-fail2ban.sh --aplicar`: instala Fail2ban con una cárcel local solo para SSH (5 intentos, ventana y bloqueo de 10 minutos) y valida configuración y servicio. Aborta si ya existe una instalación o configuración. Guarda el estado previo en `/var/lib/novagest-hardening/fail2ban/` y usa una máscara temporal de systemd durante `apt`. No ejecuta `apt update`, no activa UFW, no cambia SSH ni contraseñas y no agrega `ignoreip`. Fail2ban sí puede insertar reglas temporales en netfilter.
- `revertir-fail2ban.sh`: retira solo la cárcel de este paquete y restaura el estado previo del servicio; el paquete permanece instalado.
- `verificar-fail2ban.sh`: con sudo, inserta y retira un bloqueo de prueba usando una IP reservada de documentación, y comprueba el conjunto de rechazo y la prioridad de la cadena nftables.

## Advertencias

- Fail2ban bloquea direcciones de origen y no distingue personas que compartan una cuenta; confirmar redes de administración y una vía de acceso alternativa antes de instalarlo.
- No activar UFW sin una matriz de origen, interfaz, puerto, protocolo y servicio validada por los responsables de cada servicio (la máquina puede alojar AD, DNS, DHCP, correo, proxy y otros).
- No cambiar `PasswordAuthentication`, `PermitRootLogin`, PAM ni credenciales hasta confirmar que todas las personas administradoras tienen llave, cuenta propia y recuperación probada.
