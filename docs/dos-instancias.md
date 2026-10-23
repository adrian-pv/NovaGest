# Dos instancias de la aplicación (Ubuntu y Windows)

Diseño acordado con el DBA y despliegue: **dos instancias** de la misma aplicación (Ubuntu y Windows Server) que **escriben en la misma base** (`tramites_produccion`, en Ubuntu). Windows tiene además una réplica lógica solo para contingencia. Este documento recoge lo que el código hace y lo que cada instancia debe configurar. Lo de Nginx, IIS, túneles, firewall y bases no está aquí: es de despliegue y del DBA.

## Reglas de operación
1. **Se despliega primero Ubuntu y después Windows, con el mismo commit.** Entre un paso y otro, Windows corre unos minutos el código anterior con el esquema ya migrado: por eso las migraciones son compatibles hacia atrás (ver `CONTRIBUTING.md`, "expandir y después contraer").
2. **Las migraciones las aplica solo Ubuntu.** Windows corre con `SPRING_FLYWAY_ENABLED=false`. La aplicación arranca igual y valida el esquema contra las entidades (`ddl-auto=validate`); lo vigila `InstanciaSinFlywayTests`.
3. **Los comprobantes** se guardan en disco (`COMPROBANTES_DIR`) y en la base solo queda su nombre (un UUID con extensión, sin ruta), así que es portable entre Linux y Windows. Las carpetas de las dos instancias se sincronizan fuera de la aplicación, con unos segundos de demora.
4. **Toda la configuración sale de variables de entorno.** No hay rutas de Linux ni de Windows fijas en el código; la carpeta de comprobantes es relativa por defecto (`comprobantes`) y las imágenes de Docker la fijan en `/data/comprobantes`.

## Tarea programada de tipos de cambio
`TareaDiariaTipoCambio` corre de lunes a viernes a las 08:15 (Guatemala). Con dos instancias hay dos defensas:
- **Recomendado (configuración):** dejarla activa en **una sola** instancia. En la otra: `APP_DIVISAS_TAREA_DIARIA_HABILITADA=false`, o `APP_DIVISAS_TAREA_DIARIA_CRON=-` (Spring toma `-` como desactivada).
- **Seguro (código):** si por error queda activa en las dos, un **candado consultivo de PostgreSQL** (`BloqueoDeTarea`, `pg_try_advisory_lock`) deja que la ejecute solo una a la vez; la otra la omite y lo anota en el registro. El candado es de sesión: si una instancia se cae, la base lo libera. No necesita tablas ni migraciones.
- No es "exactamente una vez": si una instancia termina antes de que la otra empiece, la segunda también corre, pero la actualización es idempotente y lee primero lo ya guardado: no repite la consulta al Banguat por las monedas cuyo dato del día ya está confirmado (solo reintenta las que el Banguat no había confirmado).

## Comprobante que aún no llegó
Si alguien pide en una instancia un comprobante subido hace segundos en la otra, el archivo puede no haberse sincronizado. La API responde **409** (`application/problem+json`) con "El comprobante todavía no está disponible en este servidor. Si se acaba de subir, intenta de nuevo en unos segundos", y deja una advertencia en el registro (con el nombre del archivo, no con su ruta). Antes era un 500.

## Sesiones: `JWT_SECRET` en las dos instancias
- Los **refresh tokens** son valores aleatorios de 256 bits; en la base queda solo su hash. **No dependen de `JWT_SECRET`**: como la base es compartida, un refresh token emitido por una instancia sirve en la otra, que firmará el nuevo token de acceso con su propio secreto. Es el mismo usuario y la misma base, así que no abre nada nuevo.
- Los **tokens de acceso** (JWT, firmados) sí dependen del secreto. El navegador guarda los tokens **por origen** (`win.novagest.app` y `tramites.novagest.app` no se ven entre sí), así que de cara al usuario la sesión es separada por dominio con cualquiera de las dos opciones.
- **Recomendación: secretos distintos por instancia.** Un token de acceso robado en una instancia no sirve en la otra y el alcance de una filtración del secreto queda limitado a una instancia. Con secretos iguales se gana poco: no hay sesión compartida entre dominios. Decisión final: despliegue y DBA. Cualquiera sea, cada secreto debe ser largo, aleatorio, único por entorno y entregarse por un canal privado; en perfil `prod` la aplicación se niega a arrancar con uno débil.

## Límite de peticiones
`FiltroLimitePeticiones` lleva sus contadores **en memoria de cada instancia**. Con dos instancias, el límite efectivo por dirección IP puede **duplicarse** (cada instancia cuenta lo suyo; el tráfico llega por dominios distintos, así que cada visitante suele ir a una sola). El **bloqueo de cuenta** tras intentos fallidos (`intentos_fallidos`, `bloqueado_hasta`) sí está en la base y es compartido. No se cambiaron los valores. Si el equipo necesita un límite único, habría que llevar los contadores a la base: es un cambio aparte.

## Qué no cubre el código
- La sincronización de comprobantes (Syncthing u otro), la réplica y el orden de los despliegues son de despliegue y del DBA.
- Un comprobante subido en una instancia y **nunca** sincronizado se verá siempre como "todavía no disponible": hay que vigilar el estado de la sincronización.
