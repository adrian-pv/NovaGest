# Despliegue en Linux: scripts y plantillas reutilizables

Este directorio contiene solo material reutilizable y sin datos del entorno real: scripts de administración del servidor y plantillas de Nginx con marcadores (`<IP_PRIVADA>`, `<DOMINIO>`, `<SERVIDOR>`, `<TAILNET>`...). No modifica código Java, CI ni el sitio existente que comparta el servidor.

El estado verificado del entorno (direcciones, nombres de máquinas y cuentas, avances, accesos y coordinación) NO vive aquí: se mantiene en un repositorio privado del equipo. Este repositorio es público; no agregar IPs, hostnames, nombres de cuentas ni credenciales.

- [Servidor: auditoría, cuentas y Fail2ban](servidor/README.md).
- [Nginx: plantillas privadas y publicación futura](nginx/README.md).

## Uso general

1. Copiar este directorio al servidor, a una carpeta de preparación del usuario (no a `/etc`).
2. Ejecutar la auditoría protegida:

```bash
cd "$HOME/<DIRECTORIO_DE_TRABAJO>"
umask 077
sudo bash servidor/auditar-servidor.sh > auditoria-protegida.log 2>&1
```

La contraseña sudo se introduce solo en la terminal. La redirección también oculta los errores; si falla, consultar `tail -n 20 auditoria-protegida.log`.

3. Crear la cuenta administrativa personal (ver `servidor/README.md`) y verificar SSH y `sudo` en una sesión nueva antes de depender de ella.
4. Instalar Fail2ban solo desde una sesión administrativa estable, tras revisar la auditoría.
5. Validar Nginx de forma aislada:

```bash
bash nginx/validar-nginx.sh
python3 nginx/probar-proxy.py
```

El segundo comando inicia un Nginx temporal y dos backends simulados en loopback, y verifica separación de entornos, conservación de rutas y query, health, cabeceras, saneamiento de `X-Forwarded-For` y respuesta 429 del límite de login. No valida la aplicación ni sus bases de datos; al terminar elimina procesos y temporales.

No habilitar las plantillas de Nginx hasta contar con el backend real, confirmar el acceso de red y planificar el arranque de Nginx después de Tailscale si se enlaza a su IP. La publicación pública (dominio, conectividad entrante, TLS) y su control de acceso son decisiones pendientes del equipo.
