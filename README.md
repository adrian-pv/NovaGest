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

## Frontend (carpeta `frontend/`)
React + Vite + TypeScript. Requiere Node 22 o superior.
```
cd frontend
npm install                # solo la primera vez
npm run dev                # http://localhost:5173, con la API de Spring levantada en el 8080
npm run verify             # lint + formato + pruebas + compilacion (lo mismo que corre la CI)
```
- En desarrollo Vite reenvia `/api` y `/actuator/health` al backend (proxy), asi el navegador ve un solo origen y no hace falta CORS. Para apuntar a otro backend: `VITE_API_PROXY` en `frontend/.env.local` (ver `frontend/.env.example`).
- Todas las llamadas a la API pasan por `src/api/cliente.ts`: agrega el token, convierte los errores Problem Details en `ErrorApi` y nunca escribe el token en consola.
- El token de acceso vive solo en memoria (`src/api/token.ts`), nunca en localStorage.
- Cada pantalla nueva: una carpeta o archivo en `src/paginas/`, su ruta en `src/App.tsx` y su prueba junto al archivo (`*.test.tsx`).
- Si el puerto 8080 esta ocupado por otro programa (por ejemplo Apache), el backend no arranca y el frontend mostrara "No se pudo conectar con el servidor".

## Salud y documentacion de la API
Con la app levantada (perfil `dev`), sin necesidad de token:
- Salud: http://localhost:8080/actuator/health (responde `{"status":"UP"}`, sin detalles internos)
- Swagger UI: http://localhost:8080/swagger-ui.html
- OpenAPI en JSON: http://localhost:8080/v3/api-docs

Para probar endpoints protegidos en Swagger: ejecutar `POST /api/auth/login`, copiar el `accessToken` y pegarlo en **Authorize**. Cada operacion indica el permiso que exige. En el perfil `prod` la documentacion esta apagada.

## Configuracion
Copiar `.env.example` a `.env` y completar. Los secretos entran solo por variables de entorno; `.env` esta en `.gitignore`.

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
