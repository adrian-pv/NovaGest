export interface ItemMenu {
  ruta: string
  etiqueta: string
  /** Solo se muestra a quien tiene este permiso (formato recurso:accion). Implica sesión iniciada. */
  permiso?: string
  /** Solo se muestra con sesión iniciada, sin importar el permiso. */
  requiereSesion?: boolean
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
  { ruta: '/tramites', etiqueta: 'Trámites', permiso: 'tramite:leer' },
]

interface Contexto {
  autenticado: boolean
  tienePermiso: (permiso: string) => boolean
}

/** Los elementos del menú que la persona puede usar ahora. */
export function itemsVisibles(items: ItemMenu[], contexto: Contexto): ItemMenu[] {
  return items.filter((item) => {
    if (item.permiso) return contexto.autenticado && contexto.tienePermiso(item.permiso)
    if (item.requiereSesion) return contexto.autenticado
    return true
  })
}
