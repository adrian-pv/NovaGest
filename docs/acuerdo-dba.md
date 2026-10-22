# P2 · Entrega técnica para acuerdo con DBA

Fecha de revisión: 21 de octubre de 2026. Estado: propuesta pendiente de aprobación del equipo DBA.
Fuente: [tarjeta P2 en Notion](https://app.notion.com/p/3ee4e9c74a5c815f8b40c40e30ff408c).
Requisito RNF-03; control C-08. Responsable de coordinación: Brandom.

## Responsabilidades propuestas

| Actividad | Responsable |
| --- | --- |
| Escribir y probar cada migración en su PR | Desarrollo, autor de la tarjeta |
| Coordinar y comprobar la numeración antes del merge | Brandom |
| Revisar SQL, integridad, permisos y aprobar migraciones | Equipo DBA, persona pendiente de designar |
| Crear base, usuarios y entregar conexión por canal privado | Equipo DBA, pendiente de confirmar |
| Revisar el código e integrar a develop | Revisor distinto del autor, según CONTRIBUTING.md |

La aprobación del DBA y la revisión del PR deben quedar registradas con nombre, fecha y enlace de evidencia. Esta propuesta no acredita que ya hayan ocurrido.

## Conexión verificada en el repositorio

| Variable | Ejecución local | Aplicación en Docker Compose |
| --- | --- | --- |
| DB_HOST | localhost o host entregado por DBA | db, fijado en docker-compose.yml |
| DB_PORT | 5432 por defecto en dev; puerto entregado por DBA | 5432 interno; DB_PORT publica el puerto del host |
| DB_NAME | novagest por defecto en dev | DB_NAME o novagest |
| DB_USER | Usuario entregado por DBA | DB_USER obligatorio |
| DB_PASSWORD | Contraseña por canal privado | DB_PASSWORD obligatorio |

La URL es jdbc:postgresql://<host>:<puerto>/<base>. Ver .env.example y src/main/resources/application*.properties.
No guardar credenciales en este documento, Notion, commits ni capturas.
En prod se deben proporcionar todas las variables de conexión; test usa Testcontainers.
Compose usa PostgreSQL 17; las pruebas de Testcontainers usan postgres:latest (ver TestcontainersConfiguration.java).
Por tanto, las pruebas no garantizan compatibilidad específica con PostgreSQL 17; DBA debe confirmar la versión del entorno y acordar una versión fija para las pruebas.
El Compose actual crea el usuario con POSTGRES_USER para desarrollo: no constituye evidencia de mínimo privilegio.

## Migraciones y modelo entregado

Flyway ejecuta src/main/resources/db/migration al arrancar y JPA solo valida el esquema (ddl-auto=validate).
Formato: V<n>__descripcion.sql. No editar migraciones aplicadas ni reutilizar versiones.
Antes de asignar número, actualizar develop y revisar las versiones; si hay colisión, renumerar solo la migración aún no integrada.

| Versión actual | Contenido |
| --- | --- |
| V1 | Línea base, sin tablas |
| V2 | usuario, rol, permiso, usuario_rol, rol_permiso |
| V3 | token_renovacion |
| V4 | tipo_tramite |
| V5 | campo_tipo_tramite, tramite |
| V6 | tramite_historial, bitacora y triggers de inmutabilidad |
| V8 | ingreso |
| V9 | pago |
| V10 | tipo_cambio |

El salto de V6 a V8 existe en el repositorio; no exige inventar V7.
Son 14 tablas de negocio, más flyway_schema_history. El plan preliminar de Notion enumera 13: el código incluye además campo_tipo_tramite.
Los SQL versionados son la referencia de campos, índices, claves foráneas y restricciones.
Solo dev añade db/dev/R__datos_demo.sql; los datos demo no pertenecen al entorno prod.

## Permisos que DBA debe validar

La cuenta de ejecución debe operar con el mínimo privilegio, sin ser superusuario ni dueña de las tablas.
En bitacora y tramite_historial: SELECT e INSERT, con acceso necesario a sus secuencias, sin UPDATE, DELETE ni TRUNCATE.
V6 incluye triggers para bloquear esas modificaciones, pero no sustituye la configuración de roles.
Actualmente Flyway utiliza la misma conexión que la aplicación. Separar la cuenta migradora de la cuenta de ejecución requiere acordar y configurar credenciales de Flyway; no basta con revocar DDL al usuario actual.
DBA debe proponer y revisar esa separación antes de aplicar restricciones en un entorno compartido.

## Verificación y evidencia de aceptación

1. Confirmar versión de PostgreSQL, host, puerto, base y nombre del usuario por entorno, sin registrar contraseñas.
2. Ejecutar ./mvnw clean verify (en Windows: .\mvnw.cmd clean verify) con Java 21 y Docker disponibles.
3. Revisar MigracionesTests (nombres y duplicados), FlywayMigracionTests (aplicación al arranque) y las pruebas de bitácora.
4. En una base de pruebas administrada por DBA, comprobar el arranque con ddl-auto=validate y revisar flyway_schema_history.
5. Probar permisos con la cuenta real de ejecución sobre datos ficticios; confirmar el rechazo de UPDATE, DELETE y TRUNCATE en las tablas inmutables.
6. Registrar aprobación DBA y revisión del PR antes de cerrar P2.

Las pruebas automáticas del repositorio no acreditan los permisos del usuario de un servidor externo.

## Comparación con el trabajo local de Visual Studio

Se revisaron dos copias: la raíz del espacio y la carpeta NovaGest/.
La raíz está en feature/43-manual-demo y contiene cambios locales previos para Java 25.
La copia NovaGest/ contiene el avance integrado hasta la tarjeta 33: sesión, registro, diseño común y pantallas de trámites.
El frontend de la raíz solo tiene las rutas iniciales; no debe reemplazar al frontend más avanzado.
Este complemento se prepara desde develop en la copia NovaGest/, conservando los cambios de la raíz.

En el tablero consultado las tarjetas de Brandom 02, 03, 06 y 24 constan como Hecho y tienen implementación correspondiente: paquetes por módulo, conexión/Flyway, contenedores y datos demo/guía.
P2 permanece En curso y ya tenía un borrador en Notion. Este documento completa la entrega con el inventario real, las diferencias de conexión y la evidencia exigida.
La planificación antigua asigna otras tarjetas a Brandom, pero el tablero las reasignó; se conserva la asignación del tablero.

## Pendiente de confirmación externa

- [ ] DBA designa responsable de revisión y de provisión de la base.
- [ ] DBA confirma PostgreSQL 17 y los valores de conexión por entorno.
- [ ] DBA aprueba el flujo de migraciones y la separación de cuentas/permisos.
- [ ] Se registra nombre, fecha y evidencia de aprobación.
- [ ] Otra persona aprueba el PR hacia develop.

No marcar P2 como Hecho hasta disponer de esa evidencia.
