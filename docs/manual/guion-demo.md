# Guion de demostracion (10 minutos)

Tarjeta 43 · Recorre el flujo completo de un tramite con los usuarios de la tarjeta 24.
Version API: mientras no exista el frontend (tarjetas 33 a 36) la demo se hace en Swagger UI.
Cuando existan las pantallas, cada paso tiene marcado que pantalla usar.

> Probado el 19/10/2026 contra `docker compose up --build` (perfil dev): los 14 pasos responden como dice el guion.

## Antes de la demo (5 minutos, sin publico)

1. Docker Desktop encendido y `.env` completo, incluido `DEMO_PASSWORD`.
2. Empezar con la base limpia para que los ids y la bitacora se vean ordenados:
   ```
   docker compose down -v
   docker compose up --build
   ```
3. Esperar `Started NovaGestApplication` y abrir:
   - Swagger: http://localhost:8080/swagger-ui.html
   - Salud: http://localhost:8080/actuator/health (debe decir `UP`)
4. Tener a mano un comprobante de prueba (PDF, JPG o PNG de menos de 5 MB, con datos ficticios).
5. Opcional: dejar abiertas cuatro pestanas de Swagger, una por usuario, para no cambiar de token en vivo.

Usuarios (clave = valor de `DEMO_PASSWORD` del `.env`):

| Rol | Correo |
|---|---|
| Ciudadano | `ciudadano@novagest.test` |
| Gestor | `gestor@novagest.test` |
| Auditor | `auditor@novagest.test` |
| Administrador | `administrador@novagest.test` |

Como entrar en Swagger con un usuario: `POST /api/auth/login` con
`{ "correo": "...", "clave": "..." }`, copiar el `accessToken` y pegarlo en **Authorize**.

## Guion

| Min | Quien | Paso | En Swagger | Que se dice / que se ve |
|---|---|---|---|---|
| 0:00 | Presentador | Contexto | — | NovaGest permite que un ciudadano haga su tramite sin ir a ventanilla. Cuatro roles; cada uno ve solo lo que le toca. |
| 0:45 | Ciudadano | 1. Iniciar sesion | `POST /api/auth/login` | Devuelve dos tokens (acceso de 15 min y renovacion). C-01. |
| 1:15 | Ciudadano | 2. Ver tipos de tramite | `GET /api/tipos-tramite` | Ornato, IGSS y Constancia de residencia; cada tipo declara sus propios campos. |
| 1:45 | Ciudadano | 3. Crear boleto de ornato | `POST /api/tramites` | Cuerpo de ejemplo abajo. Queda en `BORRADOR`. |
| 2:30 | Ciudadano | 4. Enviar | `POST /api/tramites/{id}/transiciones` con `ENVIADO` | Solo el dueno puede enviarlo. |
| 3:00 | Gestor | 5. Ver la bandeja | `GET /api/tramites?estado=ENVIADO` | El gestor ve los tramites de todos; el ciudadano solo los suyos (C-03). |
| 3:30 | Gestor | 6. Tomarlo en revision | transicion `EN_REVISION` | Queda asignado como gestor del tramite. |
| 4:00 | Gestor | 7. Observarlo | transicion `OBSERVADO` sin comentario, y luego con comentario | Primero responde **400**: el comentario es obligatorio. Luego pasa con `"La direccion esta incompleta"`. |
| 5:00 | Ciudadano | 8. Corregir y reenviar | `PUT /api/tramites/{id}` y transicion `EN_REVISION` | Solo puede editar en Borrador u Observado. |
| 5:45 | Gestor | 9. Aprobar revision | transicion `POR_PAGAR` | Ya se puede pagar. |
| 6:15 | Ciudadano | 10. Subir comprobante | `POST /api/tramites/{id}/pagos` (archivo `comprobante`) | Pago en `PENDIENTE`. Solo PDF, JPG o PNG reales, maximo 5 MB. |
| 7:00 | Ciudadano | 11. Intentar validar su propio pago | `POST /api/pagos/{id}/validacion` | **403**: quien paga no valida (C-04, segregacion de funciones). |
| 7:30 | Gestor | 12. Validar el pago | `POST /api/pagos/{id}/validacion` con `VALIDAR` | El pago queda `VALIDADO` y el tramite pasa solo a `FINALIZADO`. |
| 8:15 | Ciudadano | 13. Ver historial | `GET /api/tramites/{id}/historial` | 7 movimientos, de BORRADOR a FINALIZADO, con quien y cuando (C-06). |
| 8:45 | Auditor | 14. Revisar la bitacora | `GET /api/bitacora?recurso=tramite` | Cada creacion, edicion y transicion con antes y despues (C-05). Intentar una transicion como auditor da **403**: solo lectura. |
| 9:30 | Presentador | Cierre | — | Resumen: flujo completo, tres permisos denegados demostrados, todo queda en historial y bitacora. |

### Cuerpos de ejemplo

Crear el tramite (paso 3). Usar el `id` de "Boleto de ornato" que devolvio el paso 2:
```json
{
  "tipoId": 1,
  "datos": {
    "dpi": "1234567890101",
    "ocupacion": "Tecnico",
    "ingreso_mensual": 4500,
    "direccion": "Santa Lucia Cotzumalguapa"
  }
}
```

Transiciones (pasos 4, 6, 7, 8 y 9):
```json
{ "estadoDestino": "ENVIADO" }
{ "estadoDestino": "OBSERVADO", "comentario": "La direccion esta incompleta" }
```

Correccion (paso 8):
```json
{
  "datos": {
    "dpi": "1234567890101",
    "ocupacion": "Tecnico",
    "ingreso_mensual": 4500,
    "direccion": "Colonia Alamedas, Santa Lucia Cotzumalguapa, Escuintla"
  }
}
```

Validacion del pago (pasos 11 y 12):
```json
{ "decision": "VALIDAR" }
```

## Si algo sale mal en vivo

| Sintoma | Causa probable | Que hacer |
|---|---|---|
| 401 en cualquier llamada | Token vencido (dura 15 min) | Volver a hacer login y pegar el token nuevo en Authorize |
| 401 en el login | Clave distinta a `DEMO_PASSWORD`, o cuenta bloqueada tras 5 fallos | Revisar el `.env`; si se bloqueo, `docker compose down -v` y levantar de nuevo |
| 409 en una transicion | El tramite no esta en el estado esperado | Ver `GET /api/tramites/{id}`: `destinosPosibles` dice a donde puede ir |
| 400 al subir el comprobante | Archivo que no es PDF/JPG/PNG real o pesa mas de 5 MB | Usar el comprobante de prueba preparado |

## Pendiente para la version con frontend

- [ ] Reemplazar la columna "En Swagger" por la pantalla de cada paso (tarjetas 33 a 36).
- [ ] Agregar capturas de cada paso en `docs/manual/capturas/`.
- [ ] Cronometrar un ensayo completo y ajustar los minutos.
