import { ErrorApi } from '../api/errores'
import type { CampoTipo, DatosTramite } from '../api/tramites'

/** Lo que la persona tiene escrito en el formulario: siempre texto, salvo las casillas (verdadero o falso). */
export type Valores = Record<string, string | boolean>

/** Valores con los que arranca el formulario: vacíos para un trámite nuevo, los guardados al editar. */
export function valoresIniciales(campos: CampoTipo[], datos: DatosTramite = {}): Valores {
  const valores: Valores = {}
  for (const campo of campos) {
    const actual = datos[campo.clave]
    valores[campo.clave] =
      campo.tipoDato === 'BOOLEANO' ? actual === true : actual === undefined ? '' : String(actual)
  }
  return valores
}

export interface Conversion {
  datos: DatosTramite
  /** Campos que no se pudieron convertir (por ejemplo un número mal escrito), por clave. */
  errores: Record<string, string>
}

const NUMERO_VALIDO = /^-?\d+(\.\d{1,2})?$/

/**
 * Convierte lo escrito a lo que espera la API. Los campos vacíos se omiten: un borrador puede estar incompleto y, al
 * editar, omitir un campo lo borra. Aquí solo se revisa que un número esté bien escrito; las demás reglas (formato,
 * mínimo, obligatorio al enviar) las decide la API, que es quien manda.
 */
export function aDatos(campos: CampoTipo[], valores: Valores): Conversion {
  const datos: DatosTramite = {}
  const errores: Record<string, string> = {}
  for (const campo of campos) {
    const crudo = valores[campo.clave]
    if (campo.tipoDato === 'BOOLEANO') {
      datos[campo.clave] = crudo === true
      continue
    }
    const texto = typeof crudo === 'string' ? crudo.trim() : ''
    if (texto === '') continue
    if (campo.tipoDato === 'NUMERO') {
      const normalizado = texto.replace(',', '.')
      if (!NUMERO_VALIDO.test(normalizado)) {
        errores[campo.clave] = 'Escribe un número, con hasta 2 decimales.'
        continue
      }
      datos[campo.clave] = Number(normalizado)
    } else {
      datos[campo.clave] = texto
    }
  }
  return { datos, errores }
}

/** Errores por campo que dio la API (vienen como "datos.clave"), por clave del campo. */
export function erroresDeDatos(error: unknown): Record<string, string> {
  const resultado: Record<string, string> = {}
  if (!(error instanceof ErrorApi)) return resultado
  for (const e of error.errores) {
    if (e.campo.startsWith('datos.')) resultado[e.campo.slice('datos.'.length)] = e.motivo
  }
  return resultado
}

/** Errores de la API que no corresponden a un campo del formulario (para no esconderlos). */
export function erroresSinCampo(error: unknown, campos: CampoTipo[]): boolean {
  if (!(error instanceof ErrorApi)) return true
  const claves = new Set(campos.map((c) => `datos.${c.clave}`))
  return error.errores.length === 0 || error.errores.some((e) => !claves.has(e.campo))
}
