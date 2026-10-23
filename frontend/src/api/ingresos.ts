import { solicitar } from './cliente'
import type { Pagina } from './tipos'

/** Un ingreso propio tal como lo devuelve la API. La fecha es AAAA-MM-DD; los instantes, ISO con zona. */
export interface Ingreso {
  id: number
  fecha: string
  montoGtq: number
  descripcion: string | null
  creadoEn: string
  actualizadoEn: string
}

/** Cuerpo para crear o reemplazar un ingreso (IngresoRequest). */
export interface SolicitudIngreso {
  fecha: string
  montoGtq: number
  descripcion: string | null
}

export interface FiltroIngresos {
  /** AAAA-MM-DD, ambas incluidas. */
  desde?: string
  hasta?: string
  /** Página pedida, empieza en 0. */
  page?: number
}

/**
 * Cómo se cotiza una moneda. El dólar va en quetzales por dólar; el euro y la libra en dólares por unidad; las demás
 * en unidades por dólar. Solo se usa para explicar el valor en pantalla: la conversión la hace la API.
 */
export type Convencion = 'QUETZALES_POR_DOLAR' | 'DOLARES_POR_UNIDAD' | 'UNIDADES_POR_DOLAR'

/** Moneda a la que se puede proyectar (GET /api/divisas/monedas). */
export interface Moneda {
  codigo: string
  nombre: string
  codigoBanguat: number
  convencion: Convencion | string
}

/** Tipo de cambio de una moneda (GET /api/divisas/tipo-cambio). */
export interface TipoCambio {
  moneda: string
  /** La fecha que se pidió (hoy si no se indicó). */
  fechaSolicitada: string
  /** La fecha real del valor: puede ser anterior si ese día no hubo publicación. */
  fecha: string
  valor: number
  convencion: Convencion | string
  fuente: string
  /** Verdadero si el Banguat no respondió y se usó el último valor guardado. */
  estimado: boolean
}

/** Suma de los ingresos propios y su valor en otra moneda (GET /api/ingresos/proyeccion). */
export interface Proyeccion {
  moneda: string
  nombreMoneda: string
  desde: string | null
  hasta: string | null
  cantidadIngresos: number
  totalGtq: number
  totalEnMoneda: number
  fechaSolicitada: string
  quetzalesPorDolar: number
  fechaDolar: string
  /** Null cuando la moneda es el dólar (basta con quetzalesPorDolar). */
  valorMoneda: number | null
  fechaMoneda: string | null
  convencion: Convencion | string
  fuente: string
  estimado: boolean
}

export interface FiltroProyeccion {
  moneda: string
  desde?: string
  hasta?: string
  /** Fecha del tipo de cambio; vacía = hoy. */
  fecha?: string
}

/** Los ingresos propios, del más reciente al más antiguo, de 20 en 20. */
export function listarIngresos(
  filtro: FiltroIngresos,
  senal?: AbortSignal,
): Promise<Pagina<Ingreso>> {
  return solicitar<Pagina<Ingreso>>('/api/ingresos', {
    consulta: {
      desde: filtro.desde,
      hasta: filtro.hasta,
      page: filtro.page ?? 0,
      sort: 'fecha,desc',
    },
    senal,
  })
}

export function obtenerIngreso(id: number, senal?: AbortSignal): Promise<Ingreso> {
  return solicitar<Ingreso>(`/api/ingresos/${id}`, { senal })
}

export function crearIngreso(solicitud: SolicitudIngreso): Promise<Ingreso> {
  return solicitar<Ingreso>('/api/ingresos', { metodo: 'POST', cuerpo: solicitud })
}

export function actualizarIngreso(id: number, solicitud: SolicitudIngreso): Promise<Ingreso> {
  return solicitar<Ingreso>(`/api/ingresos/${id}`, { metodo: 'PUT', cuerpo: solicitud })
}

/** Eliminación lógica: el ingreso deja de aparecer y de sumarse, pero queda en la base. */
export function eliminarIngreso(id: number): Promise<void> {
  return solicitar<void>(`/api/ingresos/${id}`, { metodo: 'DELETE' })
}

export function listarMonedas(senal?: AbortSignal): Promise<Moneda[]> {
  return solicitar<Moneda[]>('/api/divisas/monedas', { senal })
}

export function obtenerTipoCambio(
  moneda: string,
  fecha: string | undefined,
  senal?: AbortSignal,
): Promise<TipoCambio> {
  return solicitar<TipoCambio>('/api/divisas/tipo-cambio', { consulta: { moneda, fecha }, senal })
}

export function obtenerProyeccion(
  filtro: FiltroProyeccion,
  senal?: AbortSignal,
): Promise<Proyeccion> {
  return solicitar<Proyeccion>('/api/ingresos/proyeccion', {
    consulta: {
      moneda: filtro.moneda,
      desde: filtro.desde,
      hasta: filtro.hasta,
      fecha: filtro.fecha,
    },
    senal,
  })
}
