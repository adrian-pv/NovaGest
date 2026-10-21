import { solicitar } from './cliente'
import type { Pagina } from './tipos'

export type EstadoTramite =
  'BORRADOR' | 'ENVIADO' | 'EN_REVISION' | 'OBSERVADO' | 'POR_PAGAR' | 'FINALIZADO' | 'RECHAZADO'

export const ESTADOS: EstadoTramite[] = [
  'BORRADOR',
  'ENVIADO',
  'EN_REVISION',
  'OBSERVADO',
  'POR_PAGAR',
  'FINALIZADO',
  'RECHAZADO',
]

export type TipoDato = 'TEXTO' | 'NUMERO' | 'FECHA' | 'BOOLEANO'

/** Un campo que el tipo de trámite pide llenar. */
export interface CampoTipo {
  clave: string
  etiqueta: string
  tipoDato: TipoDato
  obligatorio: boolean
  patron: string | null
  minimo: number | null
  orden: number
}

export interface TipoTramite {
  id: number
  nombre: string
  descripcion: string | null
  monto: number
  activo: boolean
  campos: CampoTipo[]
}

/** Valor de un campo tal como lo guarda la API: texto, número, fecha en AAAA-MM-DD o verdadero/falso. */
export type ValorDato = string | number | boolean
export type DatosTramite = Record<string, ValorDato>

export interface Tramite {
  id: number
  tipoId: number
  tipoNombre: string
  ciudadanoId: number
  gestorId: number | null
  estado: EstadoTramite
  datos: DatosTramite
  motivo: string | null
  destinosPosibles: EstadoTramite[]
  creadoEn: string
  actualizadoEn: string
}

export interface Historial {
  id: number
  estadoAnterior: EstadoTramite | null
  estadoNuevo: EstadoTramite
  actorId: number
  comentario: string | null
  fecha: string
}

/** Una acción que quien consulta puede hacer sobre el trámite ahora (GET /api/tramites/{id}/transiciones). */
export interface TransicionDisponible {
  accion: string
  estadoDestino: EstadoTramite
  comentarioObligatorio: boolean
  ejecutable: boolean
  motivo: string | null
}

export interface FiltroTramites {
  estado?: string
  tipoId?: string
  desde?: string
  hasta?: string
  page?: number
  /** Elementos por página; sin él la API usa 20 (máximo 100). */
  size?: number
  /** Orden, por ejemplo "creadoEn,asc". Campos permitidos: id, creadoEn y estado. */
  sort?: string
}

export function listarTramites(
  filtro: FiltroTramites,
  senal?: AbortSignal,
): Promise<Pagina<Tramite>> {
  return solicitar<Pagina<Tramite>>('/api/tramites', {
    consulta: {
      estado: filtro.estado,
      tipoId: filtro.tipoId,
      desde: filtro.desde,
      hasta: filtro.hasta,
      page: filtro.page ?? 0,
      size: filtro.size,
      sort: filtro.sort,
    },
    senal,
  })
}

export function obtenerTramite(id: number, senal?: AbortSignal): Promise<Tramite> {
  return solicitar<Tramite>(`/api/tramites/${id}`, { senal })
}

export function crearTramite(tipoId: number, datos: DatosTramite): Promise<Tramite> {
  return solicitar<Tramite>('/api/tramites', { metodo: 'POST', cuerpo: { tipoId, datos } })
}

export function actualizarTramite(id: number, datos: DatosTramite): Promise<Tramite> {
  return solicitar<Tramite>(`/api/tramites/${id}`, { metodo: 'PUT', cuerpo: { datos } })
}

export function historialDeTramite(id: number, senal?: AbortSignal): Promise<Historial[]> {
  return solicitar<Historial[]>(`/api/tramites/${id}/historial`, { senal })
}

export function transicionesDisponibles(
  id: number,
  senal?: AbortSignal,
): Promise<TransicionDisponible[]> {
  return solicitar<TransicionDisponible[]>(`/api/tramites/${id}/transiciones`, { senal })
}

export function transicionar(
  id: number,
  estadoDestino: EstadoTramite,
  comentario?: string,
): Promise<Tramite> {
  return solicitar<Tramite>(`/api/tramites/${id}/transiciones`, {
    metodo: 'POST',
    cuerpo: { estadoDestino, comentario: comentario?.trim() || undefined },
  })
}

/** Tipos de trámite. Quien no administra solo recibe los activos; el tamaño alcanza para el catálogo completo. */
export function listarTipos(senal?: AbortSignal): Promise<Pagina<TipoTramite>> {
  return solicitar<Pagina<TipoTramite>>('/api/tipos-tramite', { consulta: { size: 100 }, senal })
}

export function obtenerTipo(id: number, senal?: AbortSignal): Promise<TipoTramite> {
  return solicitar<TipoTramite>(`/api/tipos-tramite/${id}`, { senal })
}
