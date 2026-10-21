import type { EstadoPago } from '../api/pagos'

export const ETIQUETA_PAGO: Record<EstadoPago, string> = {
  PENDIENTE: 'Pendiente de validación',
  VALIDADO: 'Validado',
  RECHAZADO: 'Rechazado',
}

export const TONO_PAGO: Record<EstadoPago, 'advertencia' | 'exito' | 'error'> = {
  PENDIENTE: 'advertencia',
  VALIDADO: 'exito',
  RECHAZADO: 'error',
}

export function nombreDeTipo(tipoMime: string): string {
  switch (tipoMime) {
    case 'application/pdf':
      return 'PDF'
    case 'image/png':
      return 'PNG'
    case 'image/jpeg':
      return 'JPG'
    default:
      return 'Archivo'
  }
}
