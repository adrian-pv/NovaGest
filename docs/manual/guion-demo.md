# Guion de demostración por pantallas (10 minutos)

Tarjeta 43. Usa las cuentas demo de la tarjeta 24 y las pantallas de las tarjetas 30, 32 y 33–36.
El tiempo es una propuesta para ensayar; no se afirma haber realizado un ensayo cronometrado.
El guion anterior del PR #67 era una demostración de API. Esta versión usa el frontend y reserva Swagger para evidenciar permisos y bitácora.

## Preparación

1. En local, completa .env según el README, incluido DEMO_PASSWORD, y ejecuta docker compose up --build.
2. En otra terminal, desde frontend/, ejecuta npm ci y npm run dev (en PowerShell: npm.cmd).
3. Comprueba http://localhost:8080/actuator/health y abre http://localhost:5173.
4. Prepara un comprobante PDF, JPG o PNG real de hasta 5 MB con datos ficticios.
5. Usa sesiones de navegador separadas por rol o cierra sesión antes de cambiar de cuenta. Las pestañas no son una garantía de aislamiento si se duplican con almacenamiento de sesión.
6. Usa registros nuevos para el ensayo. No es necesario borrar los volúmenes ni los datos anteriores.
7. Para cobrar un monto distinto de cero, el administrador debe configurarlo en el tipo. Ornato e IGSS parten de Q0.00.

| Rol | Correo |
| --- | --- |
| Ciudadano | ciudadano@novagest.test |
| Gestor | gestor@novagest.test |
| Auditor | auditor@novagest.test |
| Administrador | administrador@novagest.test |

La contraseña es el valor local de DEMO_PASSWORD; nunca mostrarla en pantalla ni registrarla en el manual.
Si la cuenta está bloqueada, esperar 15 minutos o desbloquearla con el administrador.

## Recorrido

| Minuto | Rol | Pantalla y acción | Resultado que se demuestra |
| --- | --- | --- | --- |
| 0:00 | Presentador | Abrir Inicio | Cuatro roles y separación de permisos |
| 0:45 | Ciudadano | /ingresar → Iniciar sesión | Mi panel muestra la cuenta y sus capacidades |
| 1:15 | Ciudadano | Trámites → Nuevo trámite → Boleto de ornato | Formulario según los campos del tipo |
| 1:45 | Ciudadano | Completar datos ficticios y guardar | Detalle en Borrador; anotar el número real |
| 2:15 | Ciudadano | Enviar trámite | Estado Enviado e historial actualizado |
| 2:45 | Gestor | Bandeja → Por tomar → abrir el número anotado | Lista de todos los ciudadanos, ordenada por antigüedad |
| 3:15 | Gestor | Tomar para revisión → Observar | Comentario obligatorio; confirmar “La dirección está incompleta” |
| 4:00 | Ciudadano | Abrir trámite Observado → Editar | Corregir dirección, guardar y Enviar corrección |
| 4:45 | Gestor | Bandeja → En revisión → detalle → Aprobar y pasar a pago | Estado Por pagar |
| 5:30 | Ciudadano | Detalle → Pago → Subir comprobante | Pago Pendiente; no ofrece validación |
| 6:15 | Gestor | Bandeja → Esperando pago → detalle → Descargar comprobante | El gestor puede revisar el archivo |
| 6:45 | Gestor | Validar pago → Confirmar validación | Pago Validado; trámite Finalizado; historial actualizado |
| 7:30 | Ciudadano | Consultar detalle e Historial | Ver el recorrido completo y quién actuó |
| 8:00 | Auditor | Trámites → detalle | Datos e historial consultables; sin botones de escritura |
| 8:30 | Auditor | Swagger → GET /api/bitacora?recurso=tramite | Evidencia de antes/después y actores |
| 9:15 | Administrador | Usuarios y Roles | Asignación de roles y permisos visibles |
| 9:45 | Presentador | Mostrar las evidencias | Propiedad del dato, segregación e historial |

El historial de este recorrido contiene siete movimientos si no se repiten acciones.
Los estados y los identificadores se leen de la aplicación; no se presupone que el trámite tenga id 1.

### Datos ficticios para el ornato

- DPI: 1234567890101.
- Ocupación: Técnico.
- Ingreso mensual: 4500.
- Dirección inicial: Santa Lucía Cotzumalguapa.
- Dirección corregida: Colonia Alamedas, Santa Lucía Cotzumalguapa, Escuintla.

Respeta los campos que presente el tipo actual. Si un administrador cambió su definición, adapta estos datos.

## Variante: comprobante rechazado

Antes de validar, usa **Rechazar pago**:
1. Comprueba que **Confirmar rechazo** está deshabilitado sin motivo.
2. Escribe “El comprobante no es legible” y confirma.
3. El ciudadano ve el motivo, el trámite sigue Por pagar y puede subir otro comprobante.
4. Regresa como gestor y valida el nuevo pendiente.

Un pago resuelto deja de ofrecer decisiones. Si dos gestores deciden a la vez, uno recibe conflicto y debe actualizar el estado.

## Evidencia de permisos desde Swagger (dev)

El frontend oculta acciones no autorizadas. Para demostrar que la API también las rechaza:
1. Inicia sesión como ciudadano mediante POST /api/auth/login y usa su accessToken en Authorize.
2. Intenta `POST /api/pagos/<id>/validacion` con `{"decision":"VALIDAR"}` sobre un pago pendiente: espera 403.
3. Con un segundo ciudadano, intenta `GET /api/tramites/<id>` de la primera cuenta: espera 404.
4. Como auditor intenta una transición: espera 403. Sus consultas de lectura sí deben funcionar.

No proyectes la respuesta del login con los tokens. Usa registros ficticios y el perfil dev; Swagger está apagado en prod.

## Problemas durante la demostración

| Situación | Acción |
| --- | --- |
| No conecta | Revisar API, proxy de Vite y /actuator/health |
| Sesión vencida | Volver a iniciar sesión y comprobar el resultado antes de repetir |
| Cuenta bloqueada | Esperar o desbloquear con el administrador; no borrar la base |
| Conflicto al resolver pago | Actualizar el estado del pago y revisar la decisión ya tomada |
| Archivo no aceptado | Comprobar formato real y límite de 5 MB |
| No aparece una acción | Revisar estado, permisos y cuenta activa |

## Registro de ensayo y evidencias

Al realizar el ensayo en el entorno de demostración, registrar sin credenciales:
- Fecha y versión desplegada.
- Número del trámite y pagos utilizados.
- Duración observada y resultado de cada paso.
- Capturas de sesión iniciada, borrador, observación, pago pendiente, decisión e historial final.
- Evidencias de permisos denegados y consulta de bitácora.

Las capturas deben salir de la aplicación ejecutada. Este documento no presenta imágenes ni un ensayo real como realizados.
