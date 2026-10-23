import type { FiltroBitacora } from '../api/bitacora'

/** Lo que la persona tiene escrito en los filtros: todo texto, tal como viaja en la dirección. */
export interface FiltrosEscritos {
  recurso: string
  accion: string
  actorId: string
  recursoId: string
  desde: string
  hasta: string
}

export const SIN_FILTROS: FiltrosEscritos = {
  recurso: '',
  accion: '',
  actorId: '',
  recursoId: '',
  desde: '',
  hasta: '',
}

export type ErroresFiltros = Partial<Record<keyof FiltrosEscritos, string>>

const CLAVES = Object.keys(SIN_FILTROS) as (keyof FiltrosEscritos)[]
/** Hasta 12 dígitos, sin ceros a la izquierda raros ni signos: un número de registro o de usuario. */
const ENTERO_POSITIVO = /^[1-9]\d{0,11}$/
const FECHA = /^\d{4}-\d{2}-\d{2}$/

/** Lee los filtros de la dirección; lo que no esté queda vacío. */
export function desdeParametros(params: URLSearchParams): FiltrosEscritos {
  const filtros = { ...SIN_FILTROS }
  for (const clave of CLAVES) filtros[clave] = (params.get(clave) ?? '').trim()
  return filtros
}

/** Solo viajan en la dirección los filtros con valor: una dirección limpia significa "sin filtros". */
export function aParametros(filtros: FiltrosEscritos): URLSearchParams {
  const params = new URLSearchParams()
  for (const clave of CLAVES) {
    const valor = filtros[clave].trim()
    if (valor) params.set(clave, valor)
  }
  return params
}

export function hayFiltros(filtros: FiltrosEscritos): boolean {
  return CLAVES.some((c) => filtros[c] !== '')
}

function fechaValida(texto: string): boolean {
  if (!FECHA.test(texto)) return false
  const fecha = new Date(`${texto}T00:00:00Z`)
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().startsWith(texto)
}

/** Las mismas reglas que la API (números positivos, fechas AAAA-MM-DD, desde no posterior a hasta). */
export function validar(filtros: FiltrosEscritos): ErroresFiltros {
  const errores: ErroresFiltros = {}
  if (filtros.actorId && !ENTERO_POSITIVO.test(filtros.actorId)) {
    errores.actorId = 'Escribe el número de usuario (un entero positivo).'
  }
  if (filtros.recursoId && !ENTERO_POSITIVO.test(filtros.recursoId)) {
    errores.recursoId = 'Escribe el número del registro (un entero positivo).'
  }
  if (filtros.desde && !fechaValida(filtros.desde)) errores.desde = 'Escribe una fecha válida.'
  if (filtros.hasta && !fechaValida(filtros.hasta)) errores.hasta = 'Escribe una fecha válida.'
  if (
    !errores.desde &&
    !errores.hasta &&
    filtros.desde &&
    filtros.hasta &&
    filtros.desde > filtros.hasta
  ) {
    errores.hasta = 'La fecha inicial no puede ser posterior a la final.'
  }
  return errores
}

/** Lo que se le pide a la API. Solo se llama con filtros ya validados: con alguno inválido la pantalla no consulta. */
export function aConsulta(filtros: FiltrosEscritos, page: number): FiltroBitacora {
  return {
    recurso: filtros.recurso || undefined,
    accion: filtros.accion || undefined,
    actorId: filtros.actorId ? Number(filtros.actorId) : undefined,
    recursoId: filtros.recursoId ? Number(filtros.recursoId) : undefined,
    desde: filtros.desde || undefined,
    hasta: filtros.hasta || undefined,
    page,
  }
}
