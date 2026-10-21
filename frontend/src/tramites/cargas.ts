import { obtenerTipo, obtenerTramite, type TipoTramite, type Tramite } from '../api/tramites'

export interface TramiteConTipo {
  tramite: Tramite
  tipo: TipoTramite
}

/** El trámite y el tipo al que pertenece (sus campos dan las etiquetas y reglas del formulario). */
export async function cargarTramiteConTipo(
  id: number,
  senal: AbortSignal,
): Promise<TramiteConTipo> {
  const tramite = await obtenerTramite(id, senal)
  const tipo = await obtenerTipo(tramite.tipoId, senal)
  return { tramite, tipo }
}

/**
 * Si la persona puede cambiar los datos del trámite: nadie lo toca en un estado final; el personal con alcance sobre
 * todos puede en cualquier otro estado; el ciudadano solo mientras es borrador o está observado.
 */
export function puedeEditarDatos(tramite: Tramite, alcanceTotal: boolean): boolean {
  if (tramite.estado === 'FINALIZADO' || tramite.estado === 'RECHAZADO') return false
  return alcanceTotal || tramite.estado === 'BORRADOR' || tramite.estado === 'OBSERVADO'
}

/** Número de trámite de la dirección (/tramites/12). Devuelve null si no es un entero positivo. */
export function idDeRuta(texto: string | undefined): number | null {
  return texto && /^\d{1,12}$/.test(texto) && Number(texto) > 0 ? Number(texto) : null
}
