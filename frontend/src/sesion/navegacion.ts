export interface ItemMenu {
  ruta: string
  etiqueta: string
  /** Solo se muestra a quien tiene este permiso (formato recurso:accion). Implica sesión iniciada. */
  permiso?: string
  /** Solo se muestra con sesión iniciada, sin importar el permiso. */
  requiereSesion?: boolean
  /** Solo se muestra a quien ve los registros de todas las personas (personal), además del permiso. */
  alcanceTotal?: boolean
}

/**
 * Menú principal. Cada pantalla nueva agrega aquí una línea con la ruta que registra en App.tsx y el permiso que
 * la habilita. El menú solo es comodidad: ocultar un enlace no protege nada, la API vuelve a comprobar el
 * permiso en cada llamada. Ejemplos de lo que se agregará con las tarjetas 34 a 40:
 *   { ruta: '/pagos', etiqueta: 'Pagos', permiso: 'pago:leer' }
 *   { ruta: '/bitacora', etiqueta: 'Bitácora', permiso: 'bitacora:leer' }
 */
export const ITEMS_MENU: ItemMenu[] = [
  { ruta: '/', etiqueta: 'Inicio' },
  { ruta: '/panel', etiqueta: 'Mi panel', requiereSesion: true },
  { ruta: '/bandeja', etiqueta: 'Bandeja', permiso: 'tramite:leer', alcanceTotal: true },
  { ruta: '/tramites', etiqueta: 'Trámites', permiso: 'tramite:leer' },
  { ruta: '/ingresos', etiqueta: 'Mis ingresos', permiso: 'ingreso:leer' },
  { ruta: '/divisas', etiqueta: 'Tipo de cambio', permiso: 'ingreso:leer' },
  { ruta: '/tipos', etiqueta: 'Tipos de trámite', permiso: 'tipo_tramite:editar' },
  { ruta: '/usuarios', etiqueta: 'Usuarios', permiso: 'usuario:leer' },
  { ruta: '/roles', etiqueta: 'Roles', permiso: 'rol:leer' },
]

interface Contexto {
  autenticado: boolean
  tienePermiso: (permiso: string) => boolean
  /** Si sus roles ven los registros de todas las personas. Sin dato se toma como falso. */
  alcanceTotal?: boolean
}

/** Los elementos del menú que la persona puede usar ahora. */
export function itemsVisibles(items: ItemMenu[], contexto: Contexto): ItemMenu[] {
  return items.filter((item) => {
    if (item.alcanceTotal && !(contexto.autenticado && contexto.alcanceTotal)) return false
    if (item.permiso) return contexto.autenticado && contexto.tienePermiso(item.permiso)
    if (item.requiereSesion) return contexto.autenticado
    return true
  })
}
