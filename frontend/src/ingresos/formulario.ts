import { ErrorApi, type ErrorDeCampo } from '../api/errores'
import type { Ingreso, SolicitudIngreso } from '../api/ingresos'
import { hoyEnGuatemala } from '../formato'

/** Límites del backend (IngresoRequest). La API vuelve a comprobarlos: aquí es solo comodidad. */
export const MAX_DESCRIPCION = 200
/** Hasta 12 enteros y 2 decimales, sin signo: lo que acepta el backend para montoGtq. */
const MONTO_VALIDO = /^\d{1,12}(\.\d{1,2})?$/
const FECHA_VALIDA = /^\d{4}-\d{2}-\d{2}$/

/** Lo que la persona tiene escrito en el formulario, tal como lo escribió. */
export interface FormIngreso {
  fecha: string
  monto: string
  descripcion: string
}

export interface ErroresIngreso {
  fecha?: string
  monto?: string
  descripcion?: string
}

export interface Validacion {
  errores: ErroresIngreso
  /** Solo existe si no hay ningún error. */
  solicitud?: SolicitudIngreso
}

export function formularioVacio(hoy: string = hoyEnGuatemala()): FormIngreso {
  return { fecha: hoy, monto: '', descripcion: '' }
}

export function desdeIngreso(ingreso: Ingreso): FormIngreso {
  return {
    fecha: ingreso.fecha,
    monto: ingreso.montoGtq.toFixed(2),
    descripcion: ingreso.descripcion ?? '',
  }
}

/** Una fecha AAAA-MM-DD que existe en el calendario (rechaza, por ejemplo, 2026-02-30). */
export function esFechaValida(texto: string): boolean {
  if (!FECHA_VALIDA.test(texto)) return false
  const fecha = new Date(`${texto}T00:00:00Z`)
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === texto
}

/**
 * Revisa lo escrito con las mismas reglas del backend y arma el cuerpo de la petición. El monto se compara como
 * texto (sin pasar por números con decimales) para no aceptar algo que la API rechazaría por redondeo.
 */
export function validar(form: FormIngreso, hoy: string = hoyEnGuatemala()): Validacion {
  const errores: ErroresIngreso = {}
  const fecha = form.fecha.trim()
  if (!fecha) errores.fecha = 'Escribe la fecha del ingreso.'
  else if (!esFechaValida(fecha)) errores.fecha = 'Escribe una fecha válida (AAAA-MM-DD).'
  else if (fecha > hoy) errores.fecha = 'La fecha no puede ser futura.'

  const monto = form.monto.trim().replace(',', '.')
  if (!monto) errores.monto = 'Escribe el monto en quetzales.'
  else if (!MONTO_VALIDO.test(monto)) {
    errores.monto = 'Escribe un monto sin signo, con hasta 12 enteros y 2 decimales.'
  } else if (!/[1-9]/.test(monto)) errores.monto = 'El monto debe ser mayor que cero.'

  const descripcion = form.descripcion.trim()
  if (descripcion.length > MAX_DESCRIPCION) {
    errores.descripcion = `Máximo ${MAX_DESCRIPCION} caracteres.`
  }

  if (errores.fecha || errores.monto || errores.descripcion) return { errores }
  return {
    errores,
    solicitud: { fecha, montoGtq: Number(monto), descripcion: descripcion || null },
  }
}

export interface ErroresDelServidor {
  errores: ErroresIngreso
  /** Lo que no cabe junto a ningún campo, para mostrarlo en un aviso. `null` si todo quedó en su campo. */
  aviso: unknown
}

/** La API nombra el monto `montoGtq`; en el formulario es `monto`. */
const CAMPOS: Record<string, keyof ErroresIngreso> = {
  fecha: 'fecha',
  montoGtq: 'monto',
  descripcion: 'descripcion',
}

/** Pone junto a su entrada los errores por campo que dio la API; lo demás se devuelve en `aviso`. */
export function erroresDelServidor(error: unknown): ErroresDelServidor {
  const errores: ErroresIngreso = {}
  if (!(error instanceof ErrorApi) || error.errores.length === 0) return { errores, aviso: error }
  const sobrantes: ErrorDeCampo[] = []
  for (const e of error.errores) {
    const campo = CAMPOS[e.campo]
    if (campo) errores[campo] = e.motivo
    else sobrantes.push(e)
  }
  const aviso =
    sobrantes.length === 0
      ? null
      : new ErrorApi(error.estado, error.message, sobrantes, error.esperarSegundos)
  return { errores, aviso }
}
