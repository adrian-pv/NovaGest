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

/** Un monto en otra moneda (código ISO, por ejemplo EUR), siempre con 2 decimales como lo redondea la API. */
export function enMoneda(monto: number, codigo: string): string {
  try {
    return new Intl.NumberFormat('es-GT', {
      style: 'currency',
      currency: codigo,
      currencyDisplay: 'code',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(monto)
  } catch {
    // Un código que el navegador no reconoce: el número con el código al lado, sin inventar un símbolo
    return `${codigo} ${formatoNumero.format(monto)}`
  }
}

const formatoTipoCambio = new Intl.NumberFormat('es-GT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
})

/** Un tipo de cambio tal como lo publica el Banguat: hasta 6 decimales, sin redondear a 2. */
export function tipoDeCambio(valor: number): string {
  return formatoTipoCambio.format(valor)
}

const formatoDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** La fecha de hoy en Guatemala como AAAA-MM-DD, la misma que usa la API para decidir qué es "futuro". */
export function hoyEnGuatemala(ahora: Date = new Date()): string {
  return formatoDia.format(ahora)
}
