/** Nombre legible de cada recurso de los permisos (formato recurso:accion). Uno desconocido se muestra tal cual. */
const RECURSOS: Record<string, string> = {
  tramite: 'Trámites',
  tipo_tramite: 'Tipos de trámite',
  pago: 'Pagos',
  ingreso: 'Ingresos',
  bitacora: 'Bitácora',
  usuario: 'Usuarios',
  rol: 'Roles',
}

const ACCIONES: Record<string, string> = {
  leer: 'consultar',
  crear: 'crear',
  editar: 'editar',
  eliminar: 'eliminar',
}

/** Orden natural de las acciones (la API las entrega por orden alfabético); una desconocida va al final. */
const ORDEN_ACCIONES = ['leer', 'crear', 'editar', 'eliminar']

export interface GrupoDePermisos {
  /** Nombre del recurso tal como viene de la API, por ejemplo tipo_tramite. */
  recurso: string
  etiqueta: string
  /** Acciones en lenguaje corriente, en orden natural (consultar, crear, editar, eliminar). */
  acciones: string[]
}

/**
 * Agrupa permisos recurso:accion por recurso, para mostrar "Trámites: consultar, crear" en vez de una lista larga.
 * Un permiso mal formado (sin ":") se conserva como un grupo propio para no esconderlo.
 */
export function agruparPermisos(permisos: string[]): GrupoDePermisos[] {
  const porRecurso = new Map<string, string[]>()
  for (const permiso of permisos) {
    const separador = permiso.indexOf(':')
    const recurso = separador === -1 ? permiso : permiso.slice(0, separador)
    const accion = separador === -1 ? '' : permiso.slice(separador + 1)
    const acciones = porRecurso.get(recurso) ?? []
    if (accion) acciones.push(accion)
    porRecurso.set(recurso, acciones)
  }
  const posicion = (accion: string) => {
    const i = ORDEN_ACCIONES.indexOf(accion)
    return i === -1 ? ORDEN_ACCIONES.length : i
  }
  return [...porRecurso.entries()]
    .map(([recurso, acciones]) => ({
      recurso,
      etiqueta: RECURSOS[recurso] ?? recurso,
      // sort es estable: las acciones desconocidas conservan el orden en que llegaron
      acciones: [...acciones]
        .sort((a, b) => posicion(a) - posicion(b))
        .map((a) => ACCIONES[a] ?? a),
    }))
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'))
}

export function textoDeAlcance(alcanceTotal: boolean): string {
  return alcanceTotal ? 'Ve los registros de todas las personas' : 'Ve solo sus propios registros'
}
