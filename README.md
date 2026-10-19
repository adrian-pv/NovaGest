# NovaGest

Sistema de tramites ciudadanos (curso de Auditoria de Sistemas). API en Spring Boot 4 (Java 21) con PostgreSQL, autenticacion JWT y control de acceso por rol.

Equipo de desarrollo: Ernesto (encargado), Brandom, Frank.
Documentacion y tablero: Notion, pagina NovaGest.

## Requisitos
- Java 21
- Docker Desktop encendido (pruebas con Testcontainers y base local)
- No hace falta instalar Maven: usar el wrapper `mvnw`

## Comandos
```
./mvnw clean verify      # compila y corre pruebas (Docker encendido)
./mvnw -DskipTests package   # solo compilar
```
En Windows (PowerShell): `.\mvnw.cmd clean verify`

Levantar app y base juntas (requiere `.env` completo):
```
docker compose up --build    # app en http://localhost:8080, base en el puerto DB_PORT
docker compose down          # detiene; agregar -v borra tambien los datos de la base
```

## Salud y documentacion de la API
Con la app levantada (perfil `dev`), sin necesidad de token:
- Salud: http://localhost:8080/actuator/health (responde `{"status":"UP"}`, sin detalles internos)
- Swagger UI: http://localhost:8080/swagger-ui.html
- OpenAPI en JSON: http://localhost:8080/v3/api-docs

Para probar endpoints protegidos en Swagger: ejecutar `POST /api/auth/login`, copiar el `accessToken` y pegarlo en **Authorize**. Cada operacion indica el permiso que exige. En el perfil `prod` la documentacion esta apagada.

## Configuracion
Copiar `.env.example` a `.env` y completar. Los secretos entran solo por variables de entorno; `.env` esta en `.gitignore`.

## Datos de demostracion (perfil dev)
Con el perfil `dev` la app carga un usuario de ejemplo por rol y un tercer tipo de tramite (constancia de residencia), desde `src/main/resources/db/dev/R__datos_demo.sql`. En `prod` no existen. Boleto de ornato y Pago de IGSS salen de la migracion V4.

| Rol | Correo | Que demostrar |
|---|---|---|
| Ciudadano | `ciudadano@novagest.test` | crear y enviar un tramite, subir comprobante, ver su historial |
| Gestor | `gestor@novagest.test` | tomar, observar, rechazar, pasar a por pagar y validar pago |
| Auditor | `auditor@novagest.test` | consultar tramites, pagos, usuarios, roles y bitacora (solo lectura) |
| Administrador | `administrador@novagest.test` | crear usuarios, asignar roles y mantener tipos de tramite |

La contrasena de los cuatro es el valor de `DEMO_PASSWORD` de tu `.env` (minimo 8 caracteres, sin comillas). Si falta, la app no arranca en `dev` y avisa en el log.

Si cambias `DEMO_PASSWORD` despues de la primera carga, los usuarios ya existentes conservan la clave anterior: ejecutar `docker compose down -v` y levantar de nuevo.

## Arranque rapido (menos de 15 minutos)
1. `git clone` y `git checkout develop`.
2. Copiar `.env.example` a `.env` y completar `DB_USER`, `DB_PASSWORD`, `JWT_SECRET` (32 caracteres o mas) y `DEMO_PASSWORD`, con valores de prueba.
3. `docker compose up --build` y esperar a que la app responda.
4. Abrir http://localhost:8080/actuator/health (debe decir `UP`) y http://localhost:8080/swagger-ui.html.
5. `POST /api/auth/login` con uno de los correos de arriba, copiar el `accessToken` y pegarlo en **Authorize**.


## Flujo de trabajo
- `main` es la version entregable y `develop` es integracion. Ninguna se toca directo.
- Una rama por tarjeta: `feature/08-login`, `fix/27-bloqueo-cuenta`.
- Commits cortos, en imperativo y con el numero de tarjeta: `08 Agregar login con JWT`.
- Todo entra a `develop` por pull request, aprobado por otra persona (rotacion: Ernesto revisa a Brandom, Brandom a Frank, Frank a Ernesto).
- Cada modulo vive en su carpeta (`controller`, `service`, `repository`, `dto`, `entity`) bajo `com.proyecto.tramites`.

## Reglas del codigo
- El controlador solo recibe, valida y responde; la logica va en el servicio.
- Las entidades JPA nunca salen por la API: se responden DTO.
- `spring.jpa.hibernate.ddl-auto=validate`: el esquema cambia solo con migraciones de Flyway.
- Ningun token ni contrasena en logs ni en URLs.
