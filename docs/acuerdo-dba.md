# P2 · Entrega técnica para acuerdo con DBA

Fecha de revisión: 22 de octubre de 2026. Estado: propuesta pendiente de aprobación del DBA.
Fuente: [tarjeta P2 en Notion](https://app.notion.com/p/3ee4e9c74a5c815f8b40c40e30ff408c).
Requisito RNF-03; control C-08. Responsable de coordinación: Brandom. DBA: Rodney (@hgfdiuy).

El estado de la revisión DBA (dictamen, pendientes y evidencias) vive en un solo lugar: el issue [#87](https://github.com/ernestosantizo2003/NovaGest/issues/87) y el PR [#88](https://github.com/ernestosantizo2003/NovaGest/pull/88). Este documento describe el acuerdo; no repite ese seguimiento.

## Responsabilidades propuestas

| Actividad | Responsable |
| --- | --- |
| Escribir y probar cada migración en su PR | Desarrollo, autor de la tarjeta |
| Coordinar y comprobar la numeración antes del merge | Brandom |
| Revisar SQL, integridad, permisos y aprobar migraciones | DBA: Rodney (@hgfdiuy); CODEOWNERS de migraciones propuesto en #88 |
| Crear base, roles y entregar conexión por canal privado | DBA: Rodney (@hgfdiuy) |
| Revisar el código e integrar a develop | Revisor distinto del autor, según CONTRIBUTING.md |

La aprobación del DBA y la revisión del PR deben quedar registradas con nombre, fecha y enlace de evidencia. Esta propuesta no acredita que ya hayan ocurrido.

## Conexión verificada en el repositorio

| Variable | Ejecución local | Aplicación en Docker Compose (raíz) |
| --- | --- | --- |
| DB_HOST | localhost o host entregado por DBA | db, fijado en docker-compose.yml |
| DB_PORT | 5432 por defecto en dev; puerto entregado por DBA | 5432 interno; DB_PORT publica el puerto del host |
| DB_NAME | novagest por defecto en dev | DB_NAME o novagest |
| DB_USER | Usuario entregado por DBA | DB_USER obligatorio |
| DB_PASSWORD | Contraseña por canal privado | DB_PASSWORD obligatorio |

La URL es jdbc:postgresql://<host>:<puerto>/<base>. Ver .env.example y src/main/resources/application*.properties.
No guardar credenciales en este documento, Notion, commits ni capturas.
En prod se deben proporcionar todas las variables de conexión; test usa Testcontainers.

### Cuentas por entorno

| Entorno | Cuenta de Flyway | Cuenta de la aplicación | Dueño de los objetos |
| --- | --- | --- | --- |
| Local y Compose de la raíz | La misma que la app (`application.properties` no define `spring.flyway.user`) | `DB_USER` | El mismo usuario (creado con `POSTGRES_USER`) |
| Staging | `tramites_migrador`, con `SET ROLE` al dueño; llega como `SPRING_FLYWAY_USER` desde `FLYWAY_USER` en `deploy/adrian/compose.yaml` (#80) | `tramites_app`, sin DDL | `tramites_owner`, sin login |

En local, una sola cuenta es aceptable para desarrollo, pero no es evidencia de mínimo privilegio.
En staging la separación ya existe (ver `deploy/adrian/DESPLIEGUE.md`); lo que falta es la aprobación del DBA en #87 y #88.

### Versión de PostgreSQL

| Dónde | Versión |
| --- | --- |
| Servidor de staging | PostgreSQL 18 |
| Compose de la raíz (dev) | `postgres:17` |
| Pruebas (`TestcontainersConfiguration`, `BaseAislada`) | `postgres:latest`, hoy 18 pero puede cambiar sin aviso |

Propuesta: fijar las pruebas a `postgres:18`, la versión del servidor, en un PR aparte, y decidir con el DBA si el Compose de dev también pasa a 18.

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

- Las tablas pertenecen a `tramites_owner`. Ni la app ni el migrador son dueños directos ni superusuarios.
- `tramites_app` opera con mínimo privilegio y sin DDL.
- En `bitacora` y `tramite_historial`: SELECT e INSERT, con acceso necesario a sus secuencias, sin UPDATE, DELETE ni TRUNCATE. V6 incluye triggers que bloquean esas modificaciones, pero no sustituyen la configuración de roles.
- `tramites_app` no debe tener ningún privilegio sobre `tramites.flyway_schema_history`. Hoy lo tiene; su retirada espera autorización y la comprueba la guardia de #88 (ver #87).

## Verificación y evidencia de aceptación

1. Confirmar versión de PostgreSQL, host, puerto, base y nombre del usuario por entorno, sin registrar contraseñas.
2. Ejecutar ./mvnw clean verify (en Windows: .\mvnw.cmd clean verify) con Java 21 y Docker disponibles.
3. Revisar MigracionesTests (nombres y duplicados), FlywayMigracionTests (aplicación al arranque) y las pruebas de bitácora.
4. En una base de pruebas administrada por DBA, comprobar el arranque con ddl-auto=validate y revisar flyway_schema_history.
5. Probar permisos con la cuenta real de ejecución sobre datos ficticios; confirmar el rechazo de UPDATE, DELETE y TRUNCATE en las tablas inmutables.
6. Registrar aprobación DBA y revisión del PR antes de cerrar P2.

Las pruebas automáticas del repositorio no acreditan los permisos del usuario de un servidor externo.

## Cierre de P2

Los pendientes del DBA (permisos, versión fija de las pruebas, aprobación de migraciones y evidencias) se siguen solo en [#87](https://github.com/ernestosantizo2003/NovaGest/issues/87) y [#88](https://github.com/ernestosantizo2003/NovaGest/pull/88).
P2 se marca como Hecho cuando el DBA registre ahí su aprobación con fecha y evidencia, y otra persona apruebe el PR de este documento.
