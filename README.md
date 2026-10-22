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
- Tramites (`src/tramites/`): listado con filtros en la direccion (`/tramites?estado=ENVIADO&page=1`), crear (`/tramites/nuevo`), detalle con historial y acciones (`/tramites/:id`) y editar (`/tramites/:id/editar`). El formulario se arma solo con los campos que declara el tipo (`FormularioDatos`); un borrador puede guardarse incompleto. Los botones de accion salen de `GET /api/tramites/{id}/transiciones`: la interfaz nunca decide por su cuenta que se puede hacer, solo pinta lo que la API permite. La bandeja del personal (`/bandeja`, `Bandeja.tsx`) es la cola de trabajo de quien ve los trámites de todas las personas (alcance total): colas "Por tomar", "En revisión", "Esperando pago" y "Observados", con su conteo y los más antiguos primero. Abre cada trámite en la misma pantalla de detalle de todos (no hay una segunda versión de las acciones), y el detalle vuelve al lugar de origen gracias al estado de navegación `desde`, que solo acepta rutas internas. `RutaProtegida` y el menú aceptan `alcanceTotal` para exigir ese alcance.
- Pagos (`src/pagos/`): la seccion "Pago" vive dentro del detalle del tramite (`SeccionPago`) y solo aparece en `POR_PAGAR` y `FINALIZADO`, y para quien tiene `pago:leer`. Sube el comprobante (campo multipart `comprobante`, PDF/JPG/PNG de hasta 5 MB; el navegador lo revisa antes y la API lo vuelve a revisar por su contenido real), muestra el estado de cada comprobante y permite descargarlo. Para validar o rechazar pagos (tarjeta 36) agrega los botones en `ListaPagos`/`FilaPago` para los pagos `PENDIENTE` de quien tenga `pago:editar`; la API ya impide que quien registro un pago lo resuelva.
- Tipos de tramite, administracion (`src/tipos/`, tarjeta 37): `/tipos` lista los tipos de 20 en 20 con filtro por estado en la direccion (`?activo=false&page=1`), incluidos los inactivos, y desde ahi se edita, se activa o desactiva y se elimina (con confirmacion; la eliminacion es logica). `/tipos/nuevo` y `/tipos/:id/editar` comparten el formulario `FormularioTipo` con el editor de campos (`EditorCampos`: clave, etiqueta, tipo de dato, obligatorio, patron solo en TEXTO y minimo solo en NUMERO; se reordenan con Subir/Bajar, sin arrastrar, para que funcione con teclado). La lista exige `tipo_tramite:editar` (con ese permiso siempre estan Editar y Activar/Desactivar), crear exige `tipo_tramite:crear` y el boton Eliminar aparece solo con `tipo_tramite:eliminar` (la API lo vuelve a comprobar). Activar o desactivar manda el tipo **sin** la lista de campos, y asi la API deja los que tiene; al editar, la lista de campos reemplaza a la anterior. Las reglas de la API (clave en minusculas, sin repetir, monto con 2 decimales, 30 campos como maximo) se revisan tambien en el formulario (`formulario.ts`), pero el patron (expresion regular) solo lo valida la API, porque Java y JavaScript aceptan sintaxis distintas: su motivo sale junto al campo.
- Usuarios, roles y permisos (`src/usuarios/`, tarjeta 38): `/usuarios` lista las cuentas de 20 en 20 con busqueda por nombre o correo y filtros por rol y estado en la direccion (`?buscar=ana&rol=GESTOR&activo=false&page=1`). Con `usuario:editar` salen Editar, Activar/Desactivar y Desbloquear (solo en cuentas bloqueadas por intentos fallidos); con `usuario:crear`, `/usuarios/nuevo` crea una cuenta con correo, clave inicial (8 a 72 caracteres) y roles. Quien solo tiene `usuario:leer` (auditor, gestor) ve la lista sin acciones; el gestor tampoco ve el filtro por rol porque la API le niega `rol:leer`, y la pantalla funciona igual. `/roles` (`rol:leer`) muestra que puede hacer cada rol: descripcion, alcance y permisos agrupados por recurso (`Tramites: consultar, crear`). El formulario de edicion (`FormularioUsuario`) deja desplegar los permisos de cada rol antes de asignarlo. **Regla de la API que la interfaz respeta:** nadie puede cambiar sus propios roles, desactivar ni eliminar su propia cuenta (409). En la fila y en el formulario propios esos controles salen desactivados con una explicacion; si aun asi la API responde 409, el mensaje se muestra en un aviso. No existe una regla aparte de "ultimo administrador": esa proteccion es esta. Eliminar usuarios no esta en la interfaz (la API lo permite con `usuario:eliminar`).
- Descargas: usa `solicitarArchivo` (`src/api/cliente.ts`), no un enlace `<a href>`: el archivo exige el token. Pide `Accept: */*` (con `application/json` la API respondería 406) y solo acepta nombres de archivo con letras, numeros, punto, guion y guion bajo; `guardarArchivo` (`src/descarga.ts`) lo entrega al navegador.
- Errores: un 5xx nunca muestra al usuario lo que diga el servidor (solo un mensaje general); 400, 401, 403, 404, 409 y 429 tienen titulo y mensaje propios, y el 429 usa la cabecera `Retry-After` si viene.
- Si el puerto 8080 esta ocupado por otro programa (por ejemplo Apache), el backend no arranca y el frontend mostrara "No se pudo conectar con el servidor".

## Salud y documentacion de la API
Con la app levantada (perfil `dev`), sin necesidad de token:
- Salud: http://localhost:8080/actuator/health (responde `{"status":"UP"}`, sin detalles internos)
- Swagger UI: http://localhost:8080/swagger-ui.html
- OpenAPI en JSON: http://localhost:8080/v3/api-docs

Para probar endpoints protegidos en Swagger: ejecutar `POST /api/auth/login`, copiar el `accessToken` y pegarlo en **Authorize**. Cada operacion indica el permiso que exige. En el perfil `prod` la documentacion esta apagada.

## Cabeceras de seguridad HTTP
Todas las respuestas (tambien las de error) llevan `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `Cache-Control: no-store` y una `Content-Security-Policy` que no deja cargar nada (`default-src 'none'; frame-ancestors 'none'`). Swagger tiene su propia politica, limitada a su mismo origen. `Strict-Transport-Security` (1 ano, sin subdominios ni preload) solo sale en respuestas HTTPS y se ajusta con `app.seguridad.hsts-segundos` (0 = apagado). Detras de un proxy el backend debe ver el esquema original para enviarla (tarjeta 45): el proxy debe mandar `X-Forwarded-Proto`. La politica del frontend (HTML, scripts) es otra y se define donde se sirve (tarjeta 42). Codigo en `comun/config/CabecerasSeguridad.java`.

## Limite de peticiones
`POST /api/auth/login`, `/api/auth/registro` y `/api/auth/refresh` tienen un limite por direccion IP (complementa el bloqueo por cuenta, que no frena a quien prueba una clave en muchas cuentas). Al pasarse responde `429` con Problem Details y `Retry-After` (segundos); la interfaz lo muestra como "Espera N segundos". Valores por defecto en `application.properties`: login 30 por minuto, registro 10 por hora y refresh 60 por minuto (`app.limite.<operacion>.max` y `.ventana`; `app.limite.habilitado=false` lo apaga y solo lo usan las pruebas). Codigo en `comun/seguridad/`.
- **La direccion es `request.getRemoteAddr()`.** El codigo nunca lee `X-Forwarded-For` ni `X-Real-IP` por su cuenta, porque cualquiera puede inventarlas y saltarse el limite (hay una prueba que lo vigila). Detras de Nginx el servidor corrige esa direccion solo si el proxy es de confianza: **ver "Despliegue detras de Nginx". Sin esa configuracion todos los usuarios comparten la IP del proxy y el limite los afecta a todos a la vez.**
- El contador esta en memoria de este proceso y acotado (50 000 direcciones; descarta las menos usadas): con varias instancias cada una cuenta por su lado.
- Un `429` se responde antes de autenticar: no gasta BCrypt, no toca la base ni suma fallos a ninguna cuenta.

## Despliegue detras de Nginx (IP real, HTTPS y CORS)
Detras de un proxy la API solo ve la direccion del proxy. Eso rompe cuatro cosas a la vez: la **IP de la bitacora** (auditoria), el **limite de peticiones** (todos los usuarios cuentan como uno), el **HSTS** (nunca se envia) y los **POST del navegador** (403 "Invalid CORS request", porque `Origin` es `https://dominio` y el backend cree que se le llamo por `http://127.0.0.1`). Se arregla con dos variables de entorno del backend y cuatro cabeceras de Nginx. **Sin las dos cosas, no hay despliegue valido.**

**Backend (variables de entorno, perfil `prod`):**

| Variable | Valor | Para que |
| --- | --- | --- |
| `FORWARD_HEADERS` | `native` | Acepta `X-Forwarded-For`, `-Proto` y `-Host`, pero solo de los proxies de confianza. Por defecto es `none` (se ignoran). `framework` esta prohibido. |
| `PROXIES_CONFIANZA` | expresion regular de la direccion **del proxy**, por ejemplo `127\.0\.0\.1` | De quien fiarse. La aplicacion **no arranca** si falta, si no es valida o si acepta direcciones publicas (por ejemplo `.*`). |

**Nginx (en cada `location` que reenvia a la API, incluida `/actuator/health`):**
```nginx
proxy_set_header Host              $host;
proxy_set_header X-Forwarded-For   $remote_addr;   # sobrescribe: no usar $proxy_add_x_forwarded_for si Nginx es el primer proxy
proxy_set_header X-Forwarded-Proto $scheme;        # sin esto el navegador recibe 403 en cada POST y no sale HSTS
proxy_set_header X-Forwarded-Host  $host;
```
- **Con Docker:** si el contenedor publica `127.0.0.1:8080:8080`, la API no ve `127.0.0.1` sino la puerta de enlace del puente de Docker (algo como `172.17.0.1`). Usa `PROXIES_CONFIANZA=172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}`, o la direccion exacta que muestre el registro. Si no coincide, las cabeceras se ignoran y el sintoma es que la bitacora sigue mostrando la IP del proxy.
- **Alternativa para CORS:** si por alguna razon el proxy no puede enviar `Host` y `X-Forwarded-Proto`, poner `CORS_ORIGINS=https://tu-dominio` tambien evita el 403.
- **Como comprobar el despliegue** (los tres pasos, en este orden): (1) registrar una cuenta de prueba por el dominio publico y mirar en la bitacora (`GET /api/bitacora`) que la `ip` es la del cliente y no la del proxy; (2) `curl -sI https://tu-dominio/actuator/health | grep -i strict-transport` debe mostrar `max-age=31536000`; (3) iniciar sesion desde el navegador: no debe haber ningun 403.
- Una conexion directa al backend (saltandose Nginx) no puede falsificar su IP: solo se confia en las cabeceras de las direcciones de `PROXIES_CONFIANZA`. Por eso el puerto del backend debe publicarse solo en loopback.
- Al arrancar, el registro dice `Cabeceras reenviadas aceptadas solo desde los proxies de confianza configurados` (o `ignoradas` si no hay proxy configurado): sirve para confirmar que la variable se leyo.

## Configuracion
Copiar `.env.example` a `.env` y completar. Los secretos entran solo por variables de entorno; `.env` esta en `.gitignore`.

### Perfil de Spring (obligatorio)
**No hay perfil por defecto.** Hay que elegir uno con `SPRING_PROFILES_ACTIVE` (variable de entorno o linea en `.env`): `dev` en tu maquina, `prod` en el servidor. Sin perfil la aplicacion **no arranca** y el error dice que hacer; asi, olvidar la variable en un servidor no lo deja con Swagger ni usuarios de demostracion. `docker compose` usa `dev` si no defines nada (es solo para desarrollo).
- `prod` tampoco arranca si `JWT_SECRET` falta, tiene menos de 32 caracteres, es muy repetitiva o parece una clave de ejemplo (`changeme`, `secret`, `password`...). Genera una con `openssl rand -base64 48`.
- `prod` no se combina con `dev` ni `test`.
- La documentacion Swagger solo existe en `dev` y `test`.
- Si arrancas con `./mvnw spring-boot:run` o desde el IDE, agrega `SPRING_PROFILES_ACTIVE=dev` a tu `.env` (ya viene en `.env.example`).

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
