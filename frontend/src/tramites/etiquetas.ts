import type { EstadoTramite } from '../api/tramites'

export const ETIQUETA_ESTADO: Record<EstadoTramite, string> = {
  BORRADOR: 'Borrador',
  ENVIADO: 'Enviado',
  EN_REVISION: 'En revisión',
  OBSERVADO: 'Observado',
  POR_PAGAR: 'Por pagar',
  FINALIZADO: 'Finalizado',
  RECHAZADO: 'Rechazado',
}

export const TONO_ESTADO: Record<
  EstadoTramite,
  'info' | 'exito' | 'advertencia' | 'error' | 'neutra'
> = {
  BORRADOR: 'neutra',
  ENVIADO: 'info',
  EN_REVISION: 'info',
  OBSERVADO: 'advertencia',
  POR_PAGAR: 'advertencia',
  FINALIZADO: 'exito',
  RECHAZADO: 'error',
}
