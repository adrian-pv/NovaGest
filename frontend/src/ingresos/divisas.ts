import { ErrorApi } from '../api/errores'
import { hoyEnGuatemala } from '../formato'
import { esFechaValida } from './formulario'

/**
 * Explica en palabras cómo se cotiza una moneda, con el texto de `convencion` que entrega la API. No convierte nada:
 * la conversión depende de esa convención y la hace solo la API (/api/ingresos/proyeccion).
 */
export function textoConvencion(convencion: string, moneda: string): string {
  switch (convencion) {
    case 'QUETZALES_POR_DOLAR':
      return 'Quetzales por 1 dólar estadounidense'
    case 'DOLARES_POR_UNIDAD':
      return `Dólares estadounidenses por 1 ${moneda}`
    case 'UNIDADES_POR_DOLAR':
      return `${moneda} por 1 dólar estadounidense`
    default:
      return convencion
  }
}

/** Fechas que la pantalla toma de la dirección: solo AAAA-MM-DD; cualquier otra cosa se ignora. */
export function fechaDeDireccion(valor: string | null): string {
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : ''
}

/** Un código de moneda de la dirección: tres letras; cualquier otra cosa se ignora. */
export function monedaDeDireccion(valor: string | null): string {
  const codigo = valor?.trim().toUpperCase() ?? ''
  return /^[A-Z]{3}$/.test(codigo) ? codigo : ''
}

/**
 * La API responde 503 cuando no hay ningún tipo de cambio disponible (el Banguat no respondió y no hay un valor
 * guardado). Se explica así, sin inventar un número.
 */
export function sinTipoDeCambio(error: unknown): boolean {
  return error instanceof ErrorApi && error.estado === 503
}

export interface Consulta {
  moneda: string
  desde: string
  hasta: string
  fecha: string
}

export interface ErroresConsulta {
  desde?: string
  hasta?: string
  fecha?: string
}

/** Las mismas reglas que aplica la API a la proyección: fechas válidas, desde ≤ hasta y tipo de cambio no futuro. */
export function validarConsulta(c: Consulta, hoy: string = hoyEnGuatemala()): ErroresConsulta {
  const errores: ErroresConsulta = {}
  if (c.desde && !esFechaValida(c.desde)) errores.desde = 'Escribe una fecha válida.'
  if (c.hasta && !esFechaValida(c.hasta)) errores.hasta = 'Escribe una fecha válida.'
  if (!errores.desde && !errores.hasta && c.desde && c.hasta && c.desde > c.hasta) {
    errores.desde = 'No puede ser posterior a «Hasta».'
  }
  if (c.fecha && !esFechaValida(c.fecha)) errores.fecha = 'Escribe una fecha válida.'
  else if (c.fecha && c.fecha > hoy)
    errores.fecha = 'El tipo de cambio no puede ser de una fecha futura.'
  return errores
}
