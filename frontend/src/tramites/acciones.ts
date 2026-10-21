import type { EstadoTramite } from '../api/tramites'

interface Presentacion {
  texto: string
  variante: 'primario' | 'secundario' | 'peligro'
}

/** Cómo se muestra cada acción de la máquina de estados. Una acción nueva sin entrada aquí usa su nombre tal cual. */
const ACCIONES: Record<string, Presentacion> = {
  ENVIAR: { texto: 'Enviar trámite', variante: 'primario' },
  TOMAR_EN_REVISION: { texto: 'Tomar para revisión', variante: 'primario' },
  OBSERVAR: { texto: 'Observar', variante: 'secundario' },
  CORREGIR: { texto: 'Enviar corrección', variante: 'primario' },
  APROBAR_REVISION: { texto: 'Aprobar y pasar a pago', variante: 'primario' },
  RECHAZAR: { texto: 'Rechazar', variante: 'peligro' },
  FINALIZAR: { texto: 'Finalizar trámite', variante: 'primario' },
}

export function presentacionDe(accion: string): Presentacion {
  return ACCIONES[accion] ?? { texto: accion, variante: 'secundario' }
}

/** Qué pasó con el trámite, en palabras, para confirmar una acción hecha. */
export function resultadoDe(estado: EstadoTramite): string {
  switch (estado) {
    case 'ENVIADO':
      return 'El trámite fue enviado y quedó a la espera de revisión.'
    case 'EN_REVISION':
      return 'El trámite quedó en revisión.'
    case 'OBSERVADO':
      return 'El trámite quedó observado: la persona debe corregirlo.'
    case 'POR_PAGAR':
      return 'La revisión fue aprobada: el trámite quedó pendiente de pago.'
    case 'FINALIZADO':
      return 'El trámite fue finalizado.'
    case 'RECHAZADO':
      return 'El trámite fue rechazado.'
    default:
      return 'El trámite fue actualizado.'
  }
}
