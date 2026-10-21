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
- Sesion (`src/sesion/`): el token de acceso vive solo en memoria (`src/api/token.ts`), nunca en localStorage; el de renovacion se guarda en `sessionStorage` para sobrevivir a F5 (decision y alternativa en `src/sesion/almacen.ts`). Al recibir 401 el cliente renueva la sesion y reintenta una vez.
- El token de renovacion es de un solo uso y reusarlo revoca todas las sesiones del usuario, por eso `renovarSesion()` (`src/sesion/renovacion.ts`) comparte una sola renovacion entre todas las llamadas. No llames a `renovarTokens` directamente desde una pantalla.
- Para proteger una ruta: dentro de `<Route element={<RutaProtegida />}>`; si ademas exige un permiso, `<RutaProtegida permiso="tramite:leer" />`. El permiso sale de `GET /api/usuarios/yo` (el token no los lleva) y solo oculta cosas: la API vuelve a comprobarlo.
- Para probar con los usuarios de demostracion (ver "Datos de demostracion"): inicia sesion con `ciudadano@novagest.test`, `gestor@novagest.test`, `auditor@novagest.test` o `administrador@novagest.test` y la clave `DEMO_PASSWORD` de tu `.env`.
- Cada pantalla nueva: un archivo en `src/paginas/`, su ruta en `src/App.tsx`, su enlace de menu en `src/sesion/navegacion.ts` (con el permiso que lo habilita) y su prueba junto al archivo (`*.test.tsx`). La pantalla se dibuja dentro del marco comun (`Diseno`), asi que NO abre su propio `<main>`.
- Piezas de interfaz reutilizables en `src/componentes/`: `Boton`, `Campo` (formulario accesible con error y ayuda), `Aviso`, `AvisoError` (muestra cualquier error de la API de forma uniforme), `Insignia`, `Cargando`, `TablaPaginada` (listados con cargando, error, vacio y paginacion de Spring) y `useTitulo`. Los colores y espacios salen de las variables de `src/index.css` (tema claro y oscuro automatico); no escribas colores a mano en las pantallas.
- Paginacion: la API devuelve `{ content: [...], page: { size, number, totalElements, totalPages } }` (Spring Data en modo VIA_DTO), NO los datos de pagina en la raiz. El tipo `Pagina<T>` de `src/api/tipos.ts` ya lo refleja; usa siempre `pagina.page.totalElements`. En las pruebas arma las paginas con `pagina()` de `src/test/datos.ts`, que respeta esa forma.
- Tramites (`src/tramites/`): listado con filtros en la direccion (`/tramites?estado=ENVIADO&page=1`), crear (`/tramites/nuevo`), detalle con historial y acciones (`/tramites/:id`) y editar (`/tramites/:id/editar`). El formulario se arma solo con los campos que declara el tipo (`FormularioDatos`); un borrador puede guardarse incompleto. Los botones de accion salen de `GET /api/tramites/{id}/transiciones`: la interfaz nunca decide por su cuenta que se puede hacer, solo pinta lo que la API permite. La bandeja del gestor (tarjeta 35) reutiliza estas mismas pantallas, porque la API ya limita lo que cada rol ve.
- Errores: un 5xx nunca muestra al usuario lo que diga el servidor (solo un mensaje general); 400, 401, 403, 404, 409 y 429 tienen titulo y mensaje propios, y el 429 usa la cabecera `Retry-After` si viene.
- Si el puerto 8080 esta ocupado por otro programa (por ejemplo Apache), el backend no arranca y el frontend mostrara "No se pudo conectar con el servidor".

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
