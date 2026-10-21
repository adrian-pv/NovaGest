const ZONA = 'America/Guatemala'

const formatoFechaHora = new Intl.DateTimeFormat('es-GT', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: ZONA,
})

const formatoFecha = new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeZone: 'UTC' })

const formatoQuetzales = new Intl.NumberFormat('es-GT', {
  style: 'currency',
  currency: 'GTQ',
  currencyDisplay: 'narrowSymbol',
})

const formatoNumero = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 2 })

/** Un instante de la API (ISO con zona) en hora de Guatemala. Valor ilegible: se devuelve tal cual. */
export function fechaHora(iso: string): string {
  const fecha = new Date(iso)
  return Number.isNaN(fecha.getTime()) ? iso : formatoFechaHora.format(fecha)
}

/** Una fecha sin hora (AAAA-MM-DD). Se formatea en UTC para que no cambie de día según la zona del navegador. */
export function soloFecha(aaaaMmDd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(aaaaMmDd)) return aaaaMmDd
  const fecha = new Date(`${aaaaMmDd}T00:00:00Z`)
  return Number.isNaN(fecha.getTime()) ? aaaaMmDd : formatoFecha.format(fecha)
}

export function quetzales(monto: number): string {
  return formatoQuetzales.format(monto)
}

export function numero(valor: number): string {
  return formatoNumero.format(valor)
}
