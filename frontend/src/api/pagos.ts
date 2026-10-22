import { solicitar, solicitarArchivo, type ArchivoDescargado } from './cliente'
import type { Pagina } from './tipos'
import type { EstadoTramite } from './tramites'

export type EstadoPago = 'PENDIENTE' | 'VALIDADO' | 'RECHAZADO'
export type DecisionPago = 'VALIDAR' | 'RECHAZAR'

export function resolverPago(
  id: number,
  decision: DecisionPago,
  comentario?: string,
): Promise<Pago> {
  return solicitar<Pago>(`/api/pagos/${id}/validacion`, {
    metodo: 'POST',
    cuerpo: { decision, ...(comentario?.trim() ? { comentario: comentario.trim() } : {}) },
  })
}

export interface Pago {
  id: number
  tramiteId: number
  monto: number
  estado: EstadoPago
  comprobanteTipo: string
  comprobanteTamano: number
  comprobanteHash: string
  creadoPor: number
  validadoPor: number | null
  validadoEn: string | null
  /** Motivo, si el pago fue rechazado. */
  comentario: string | null
  /** Solo viene al crear o resolver un pago. */
  tramiteEstado: EstadoTramite | null
  creadoEn: string
}

/** Los pagos de un trámite, el más reciente primero (la API ordena por fecha de creación descendente). */
export function listarPagosDeTramite(
  tramiteId: number,
  senal?: AbortSignal,
): Promise<Pagina<Pago>> {
  return solicitar<Pagina<Pago>>('/api/pagos', { consulta: { tramiteId }, senal })
}

/** Sube el comprobante. El campo se llama "comprobante" y la API valida el contenido real del archivo. */
export function subirComprobante(tramiteId: number, archivo: File): Promise<Pago> {
  const formulario = new FormData()
  formulario.append('comprobante', archivo)
  return solicitar<Pago>(`/api/tramites/${tramiteId}/pagos`, { metodo: 'POST', formulario })
}

export function descargarComprobante(pagoId: number): Promise<ArchivoDescargado> {
  return solicitarArchivo(`/api/pagos/${pagoId}/comprobante`)
}
