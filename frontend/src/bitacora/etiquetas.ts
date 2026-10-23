/**
 * Nombres legibles de lo que registra la bitácora. Los códigos son los que escribe el backend (`BitacoraService`); uno
 * que no esté aquí (una acción nueva) se muestra tal cual, así que nada se oculta por faltar en esta lista.
 */
const ACCIONES: Record<string, string> = {
  CREAR_TRAMITE: 'Trámite creado',
  EDITAR_TRAMITE: 'Trámite editado',
  ELIMINAR_TRAMITE: 'Trámite eliminado',
  TRANSICION_TRAMITE: 'Cambio de estado de un trámite',
  CREACION_PAGO: 'Pago registrado',
  VALIDACION_PAGO: 'Pago validado',
  RECHAZO_PAGO: 'Pago rechazado',
  CREAR_TIPO_TRAMITE: 'Tipo de trámite creado',
  EDITAR_TIPO_TRAMITE: 'Tipo de trámite editado',
  ELIMINAR_TIPO_TRAMITE: 'Tipo de trámite eliminado',
  CREAR_USUARIO: 'Usuario creado',
  EDITAR_USUARIO: 'Usuario editado',
  ELIMINAR_USUARIO: 'Usuario eliminado',
  DESBLOQUEAR_USUARIO: 'Cuenta desbloqueada',
  REGISTRO_USUARIO: 'Cuenta registrada',
  CREAR_ROL: 'Rol creado',
  EDITAR_ROL: 'Rol editado',
  ELIMINAR_ROL: 'Rol eliminado',
  CREAR_INGRESO: 'Ingreso registrado',
  EDITAR_INGRESO: 'Ingreso editado',
  ELIMINAR_INGRESO: 'Ingreso eliminado',
  BLOQUEO_CUENTA: 'Cuenta bloqueada por intentos fallidos',
  CIERRE_SESION: 'Cierre de sesión',
  REUSO_TOKEN_RENOVACION: 'Token de renovación reutilizado (sesiones revocadas)',
  ACTUALIZAR_TIPO_CAMBIO: 'Actualización del tipo de cambio',
  CONSULTA_BITACORA: 'Consulta de la bitácora',
}

const RECURSOS: Record<string, string> = {
  tramite: 'Trámites',
  pago: 'Pagos',
  tipo_tramite: 'Tipos de trámite',
  usuario: 'Usuarios',
  rol: 'Roles',
  ingreso: 'Ingresos',
  tipo_cambio: 'Tipos de cambio',
  bitacora: 'Bitácora',
}

export function etiquetaDeAccion(codigo: string): string {
  return ACCIONES[codigo] ?? codigo
}

export function etiquetaDeRecurso(codigo: string): string {
  return RECURSOS[codigo] ?? codigo
}

export interface Opcion {
  valor: string
  texto: string
}

function ordenadas(mapa: Record<string, string>): Opcion[] {
  return Object.entries(mapa)
    .map(([valor, texto]) => ({ valor, texto }))
    .sort((a, b) => a.texto.localeCompare(b.texto, 'es'))
}

export const OPCIONES_ACCION: Opcion[] = ordenadas(ACCIONES)
export const OPCIONES_RECURSO: Opcion[] = ordenadas(RECURSOS)

/**
 * Las opciones de un filtro más el valor actual si no está en la lista (por ejemplo, una dirección con una acción que
 * esta pantalla todavía no conoce): así el filtro puede mostrarse y quitarse en vez de quedar invisible.
 */
export function conValorActual(opciones: Opcion[], actual: string): Opcion[] {
  if (!actual || opciones.some((o) => o.valor === actual)) return opciones
  return [...opciones, { valor: actual, texto: actual }]
}
