# Manual de usuario de NovaGest

Tarjeta 43 · Un capitulo por rol. Esta version describe que puede hacer cada rol y con que operacion de la API.
Las capturas se agregan cuando existan las pantallas (tarjetas 33 a 40); cada lugar esta marcado con **[CAPTURA]**.

## Antes de empezar

- Para probarlo en local: seguir "Arranque rapido" del `README.md`. Los usuarios de ejemplo (uno por rol) estan en la seccion "Datos de demostracion".
- Iniciar sesion: correo y clave. Tras 5 claves incorrectas seguidas la cuenta se bloquea 15 minutos.
- La sesion dura 15 minutos y se renueva sola mientras se usa. "Cerrar sesion" invalida la renovacion.
- Cada rol ve solo lo que le corresponde. Si una accion no esta permitida, el sistema la rechaza aunque se intente directo en la API.

**[CAPTURA] Pantalla de inicio de sesion**

### Estados de un tramite

| Estado | Significado | Quien lo mueve |
|---|---|---|
| Borrador | El ciudadano lo esta llenando | Ciudadano: lo envia |
| Enviado | Esperando a un gestor | Gestor: lo toma |
| En revision | Un gestor lo revisa | Gestor: lo observa, lo rechaza o lo pasa a por pagar |
| Observado | Falta corregir algo | Ciudadano: corrige y lo reenvia |
| Por pagar | Aprobado; falta el pago | Ciudadano sube comprobante; gestor lo valida |
| Finalizado | Pago validado, tramite terminado | Estado final |
| Rechazado | No procede, con motivo | Estado final |

---

## 1. Ciudadano

**Que puede hacer:** registrarse, crear y seguir sus propios tramites, pagar con comprobante y llevar sus ingresos.
**Que no puede:** ver tramites ni pagos de otras personas, ni validar sus propios pagos.

### 1.1 Registrarse e iniciar sesion
- Registro publico con nombre, correo y clave (`POST /api/auth/registro`). Queda con rol Ciudadano.
- **[CAPTURA] Formulario de registro**

### 1.2 Crear un tramite
1. Elegir el tipo: Boleto de ornato, Pago de IGSS o Constancia de residencia.
2. Llenar los campos que pide ese tipo (por ejemplo, el ornato pide DPI de 13 digitos, ocupacion e ingreso mensual).
3. Guardar: queda en **Borrador** y se puede editar.
4. Enviar: pasa a **Enviado**. Desde ahi ya no se edita, salvo que el gestor lo observe.
- API: `POST /api/tramites`, `PUT /api/tramites/{id}`, transicion `ENVIADO`.
- **[CAPTURA] Formulario del tramite** · **[CAPTURA] Lista "Mis tramites"**

### 1.3 Corregir un tramite observado
- El comentario del gestor aparece en el tramite. Corregir los datos y reenviar (vuelve a **En revision**).
- **[CAPTURA] Tramite observado con el comentario**

### 1.4 Pagar
1. Cuando el tramite esta en **Por pagar**, subir el comprobante: PDF, JPG o PNG de hasta 5 MB.
2. El pago queda **Pendiente** hasta que un gestor lo revise.
3. Si el gestor lo rechaza, el tramite sigue en Por pagar y se puede subir otro comprobante.
- API: `POST /api/tramites/{id}/pagos`, `GET /api/pagos`, `GET /api/pagos/{id}/comprobante`.
- **[CAPTURA] Subir comprobante** · **[CAPTURA] Estado del pago**

### 1.5 Ver el historial
- Cada cambio de estado con fecha, quien lo hizo y su comentario. API: `GET /api/tramites/{id}/historial`.
- **[CAPTURA] Historial del tramite**

### 1.6 Mis ingresos y proyeccion en otra moneda
- Registrar, editar y eliminar ingresos propios (solo los ve su dueno).
- Proyectar los ingresos en otra moneda con el tipo de cambio del Banguat. Si el Banguat no responde, se usa el ultimo valor guardado y se marca como estimado.
- API: `/api/ingresos`, `GET /api/ingresos/proyeccion`, `GET /api/divisas/monedas`.
- **[CAPTURA] Lista de ingresos** · **[CAPTURA] Proyeccion**

---

## 2. Gestor

**Que puede hacer:** ver todos los tramites, revisarlos y moverlos de estado, y validar o rechazar pagos.
**Que no puede:** crear tramites ni pagos, ni ver ingresos de nadie.

### 2.1 Bandeja de tramites
- Lista de todos los tramites con filtros por estado, tipo y fechas, paginada.
- API: `GET /api/tramites?estado=ENVIADO`.
- **[CAPTURA] Bandeja del gestor con filtros**

### 2.2 Revisar un tramite
1. **Tomar** un tramite Enviado: pasa a En revision y queda asignado.
2. Desde En revision:
   - **Observar** (comentario obligatorio): vuelve al ciudadano para corregir.
   - **Rechazar** (motivo obligatorio): es definitivo.
   - **Aprobar**: pasa a Por pagar.
- Solo aparecen las acciones validas para el estado actual (`destinosPosibles`). Una transicion no permitida responde 409.
- API: `POST /api/tramites/{id}/transiciones`.
- **[CAPTURA] Detalle del tramite con botones de accion**

### 2.3 Validar pagos
1. Ver pagos pendientes y abrir el comprobante.
2. **Validar**: el pago queda validado y el tramite pasa solo a **Finalizado**.
3. **Rechazar** (comentario obligatorio): el ciudadano puede subir otro comprobante.
- Nadie valida un pago que registro el mismo (segregacion de funciones).
- API: `GET /api/pagos?estado=PENDIENTE`, `POST /api/pagos/{id}/validacion`.
- **[CAPTURA] Lista de pagos pendientes** · **[CAPTURA] Validar o rechazar**

---

## 3. Auditor

**Que puede hacer:** consultar tramites, tipos, pagos, usuarios, roles y la bitacora.
**Que no puede:** crear, editar ni eliminar nada (solo lectura), ni ver ingresos.

### 3.1 Bitacora
- Cada creacion, edicion, eliminacion y cambio de estado, con quien, cuando, el valor anterior y el nuevo.
- Filtros por recurso, accion y fechas. Nadie puede editarla ni borrarla.
- API: `GET /api/bitacora`.
- **[CAPTURA] Bitacora con filtros**

### 3.2 Consultas
- Tramites con su historial, pagos con su comprobante, usuarios y roles con sus permisos.
- API: `GET /api/tramites`, `GET /api/pagos`, `GET /api/usuarios`, `GET /api/roles`.
- **[CAPTURA] Detalle de un tramite visto por el auditor**

---

## 4. Administrador

**Que puede hacer:** administrar usuarios, roles y tipos de tramite.
**Que no puede:** ver ingresos de nadie, cambiar su propio rol ni dejar el sistema sin administradores.

### 4.1 Usuarios
- Crear usuarios, asignar o quitar roles, desactivar, desbloquear tras intentos fallidos y eliminar (borrado logico).
- API: `/api/usuarios`, `POST /api/usuarios/{id}/desbloquear`.
- **[CAPTURA] Lista de usuarios** · **[CAPTURA] Asignar roles**

### 4.2 Roles y permisos
- Ver los permisos (recurso + accion) y armar roles con ellos, sin tocar codigo.
- API: `/api/roles`, `GET /api/roles/permisos`.
- **[CAPTURA] Rol con sus permisos**

### 4.3 Tipos de tramite
- Crear y editar tipos, su monto y los campos que pide cada uno (texto, numero, fecha o si/no; obligatorio, patron y minimo).
- Los montos de Ornato e IGSS vienen en 0.00 hasta que se definan.
- API: `/api/tipos-tramite`.
- **[CAPTURA] Formulario de tipo de tramite con sus campos**

---

## Preguntas frecuentes

| Pregunta | Respuesta |
|---|---|
| Me dice "credenciales invalidas" | Revisar correo y clave. Tras 5 fallos la cuenta se bloquea 15 minutos; el administrador puede desbloquearla. |
| No puedo editar mi tramite | Solo se edita en Borrador u Observado. |
| Mi comprobante no se acepta | Debe ser PDF, JPG o PNG real y pesar 5 MB o menos. |
| No veo un tramite que deberia ver | El ciudadano solo ve los suyos; los demas roles ven todos. |
