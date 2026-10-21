import { ErrorApi, type ErrorDeCampo } from '../api/errores'
import type { CampoSolicitud, SolicitudTipo, TipoDato, TipoTramite } from '../api/tramites'

/** Límites del backend (TipoTramiteRequest y CampoTipoRequest). La API vuelve a comprobarlos: aquí es solo comodidad. */
export const MAX_CAMPOS = 30
const MAX_NOMBRE = 100
const MAX_DESCRIPCION = 255
const MAX_CLAVE = 50
const MAX_ETIQUETA = 100
const MAX_PATRON = 200

const CLAVE_VALIDA = /^[a-z][a-z0-9_]*$/
/** Hasta 12 enteros y 2 decimales, sin signo: lo que acepta el backend para el monto y el mínimo. */
const DECIMAL_VALIDO = /^\d{1,12}(\.\d{1,2})?$/

export const TIPOS_DE_DATO: { valor: TipoDato; texto: string }[] = [
  { valor: 'TEXTO', texto: 'Texto' },
  { valor: 'NUMERO', texto: 'Número' },
  { valor: 'FECHA', texto: 'Fecha' },
  { valor: 'BOOLEANO', texto: 'Sí / No' },
]

/**
 * Un campo en el editor. `uid` identifica la fila mientras se edita (la clave puede estar vacía, repetida o cambiar),
 * así los errores y el foco no se confunden al reordenar o quitar filas. Todo se guarda como texto, como se escribe.
 */
export interface FilaCampo {
  uid: number
  clave: string
  etiqueta: string
  tipoDato: TipoDato
  obligatorio: boolean
  patron: string
  minimo: string
}

/** Lo que la persona tiene escrito en el formulario del tipo. */
export interface FormTipo {
  nombre: string
  descripcion: string
  monto: string
  activo: boolean
  campos: FilaCampo[]
}

export type PropiedadDeCampo = 'clave' | 'etiqueta' | 'tipoDato' | 'patron' | 'minimo'

export interface ErroresTipo {
  nombre?: string
  descripcion?: string
  monto?: string
  /** Error de la lista de campos en conjunto (por ejemplo, demasiados). */
  campos?: string
  /** Errores por fila (uid) y propiedad. */
  filas: Record<number, Partial<Record<PropiedadDeCampo, string>>>
}

let siguienteUid = 1

export function nuevaFila(extra: Partial<Omit<FilaCampo, 'uid'>> = {}): FilaCampo {
  return {
    uid: siguienteUid++,
    clave: '',
    etiqueta: '',
    tipoDato: 'TEXTO',
    obligatorio: false,
    patron: '',
    minimo: '',
    ...extra,
  }
}

export function formularioVacio(): FormTipo {
  return { nombre: '', descripcion: '', monto: '0', activo: true, campos: [] }
}

/** El formulario con los datos de un tipo existente; los campos van en el orden que tiene el tipo. */
export function desdeTipo(tipo: TipoTramite): FormTipo {
  return {
    nombre: tipo.nombre,
    descripcion: tipo.descripcion ?? '',
    monto: String(tipo.monto),
    activo: tipo.activo,
    campos: [...tipo.campos]
      .sort((a, b) => a.orden - b.orden)
      .map((c) =>
        nuevaFila({
          clave: c.clave,
          etiqueta: c.etiqueta,
          tipoDato: c.tipoDato,
          obligatorio: c.obligatorio,
          patron: c.patron ?? '',
          minimo: c.minimo === null ? '' : String(c.minimo),
        }),
      ),
  }
}

/** Mueve la fila de `indice` una posición hacia arriba (-1) o abajo (+1). Fuera de los límites no cambia nada. */
export function moverFila(campos: FilaCampo[], indice: number, sentido: -1 | 1): FilaCampo[] {
  const destino = indice + sentido
  if (indice < 0 || indice >= campos.length || destino < 0 || destino >= campos.length)
    return campos
  const copia = [...campos]
  ;[copia[indice], copia[destino]] = [copia[destino], copia[indice]]
  return copia
}

function normalizarDecimal(texto: string): string {
  return texto.trim().replace(',', '.')
}

export interface Validacion {
  errores: ErroresTipo
  /** Solo existe si no hay ningún error. */
  solicitud?: SolicitudTipo
}

function sinErrores(errores: ErroresTipo): boolean {
  return (
    !errores.nombre &&
    !errores.descripcion &&
    !errores.monto &&
    !errores.campos &&
    Object.keys(errores.filas).length === 0
  )
}

/**
 * Revisa lo escrito con las mismas reglas del backend y arma el cuerpo de la petición. Si algo está mal devuelve los
 * errores, por campo, para mostrarlos junto a cada entrada. El patrón (expresión regular) no se valida aquí: Java y
 * JavaScript aceptan sintaxis distintas, y quien decide es la API (que responde con el motivo).
 */
export function validar(form: FormTipo): Validacion {
  const errores: ErroresTipo = { filas: {} }
  const nombre = form.nombre.trim()
  if (!nombre) errores.nombre = 'Escribe el nombre del tipo.'
  else if (nombre.length > MAX_NOMBRE) errores.nombre = `Máximo ${MAX_NOMBRE} caracteres.`
  if (form.descripcion.trim().length > MAX_DESCRIPCION) {
    errores.descripcion = `Máximo ${MAX_DESCRIPCION} caracteres.`
  }
  const monto = normalizarDecimal(form.monto)
  if (!monto) errores.monto = 'Escribe el monto (puede ser 0).'
  else if (!DECIMAL_VALIDO.test(monto)) {
    errores.monto = 'Escribe un monto sin signo, con hasta 2 decimales.'
  }
  if (form.campos.length > MAX_CAMPOS) {
    errores.campos = `Un tipo puede tener como máximo ${MAX_CAMPOS} campos.`
  }

  const vistas = new Map<string, number>()
  const marcar = (uid: number, propiedad: PropiedadDeCampo, motivo: string) => {
    errores.filas[uid] = { ...errores.filas[uid], [propiedad]: motivo }
  }
  for (const fila of form.campos) {
    const clave = fila.clave.trim()
    if (!clave) marcar(fila.uid, 'clave', 'Escribe la clave del campo.')
    else if (clave.length > MAX_CLAVE) marcar(fila.uid, 'clave', `Máximo ${MAX_CLAVE} caracteres.`)
    else if (!CLAVE_VALIDA.test(clave)) {
      marcar(fila.uid, 'clave', 'Usa minúsculas, números o guion bajo, y empieza con una letra.')
    } else if (vistas.has(clave)) marcar(fila.uid, 'clave', 'Esta clave ya está en otro campo.')
    else vistas.set(clave, fila.uid)

    const etiqueta = fila.etiqueta.trim()
    if (!etiqueta) marcar(fila.uid, 'etiqueta', 'Escribe lo que verá quien llene el trámite.')
    else if (etiqueta.length > MAX_ETIQUETA) {
      marcar(fila.uid, 'etiqueta', `Máximo ${MAX_ETIQUETA} caracteres.`)
    }
    if (fila.tipoDato === 'TEXTO' && fila.patron.trim().length > MAX_PATRON) {
      marcar(fila.uid, 'patron', `Máximo ${MAX_PATRON} caracteres.`)
    }
    if (fila.tipoDato === 'NUMERO' && fila.minimo.trim()) {
      if (!DECIMAL_VALIDO.test(normalizarDecimal(fila.minimo))) {
        marcar(fila.uid, 'minimo', 'Escribe un mínimo sin signo, con hasta 2 decimales.')
      }
    }
  }
  if (!sinErrores(errores)) return { errores }

  const campos: CampoSolicitud[] = form.campos.map((fila) => ({
    clave: fila.clave.trim(),
    etiqueta: fila.etiqueta.trim(),
    tipoDato: fila.tipoDato,
    obligatorio: fila.obligatorio,
    // El patrón solo aplica a texto y el mínimo solo a número: lo que quedó escrito de otro tipo no se manda
    patron: fila.tipoDato === 'TEXTO' && fila.patron.trim() ? fila.patron.trim() : null,
    minimo:
      fila.tipoDato === 'NUMERO' && fila.minimo.trim()
        ? Number(normalizarDecimal(fila.minimo))
        : null,
  }))
  return {
    errores,
    solicitud: {
      nombre,
      descripcion: form.descripcion.trim() || null,
      monto: Number(monto),
      activo: form.activo,
      campos,
    },
  }
}

const RUTA_CAMPO = /^campos\[(\d+)\]\.(\w+)$/
const PROPIEDADES: PropiedadDeCampo[] = ['clave', 'etiqueta', 'tipoDato', 'patron', 'minimo']

export interface ErroresDelServidor {
  errores: ErroresTipo
  /**
   * Lo que hay que mostrar en un aviso porque no cabe junto a ningún campo: el mismo error pero solo con los detalles
   * que no se pudieron ubicar. `null` si todo quedó junto a su entrada.
   */
  aviso: unknown
}

/**
 * Pone junto a su entrada los errores que dio la API (nombres como `monto` o `campos[2].clave`). Todo error que no
 * corresponda a un campo conocido, o cualquier fallo sin detalle por campo (un 409 por nombre repetido, por ejemplo),
 * se devuelve en `aviso` para que la pantalla lo muestre y no se pierda, sin repetir lo que ya está junto a un campo.
 */
export function erroresDelServidor(error: unknown, form: FormTipo): ErroresDelServidor {
  const errores: ErroresTipo = { filas: {} }
  if (!(error instanceof ErrorApi) || error.errores.length === 0) return { errores, aviso: error }
  const sobrantes: ErrorDeCampo[] = []
  for (const e of error.errores) {
    if (e.campo === 'nombre' || e.campo === 'descripcion' || e.campo === 'monto') {
      errores[e.campo] = e.motivo
      continue
    }
    if (e.campo === 'campos') {
      errores.campos = e.motivo
      continue
    }
    const coincide = RUTA_CAMPO.exec(e.campo)
    const fila = coincide ? form.campos[Number(coincide[1])] : undefined
    const propiedad = coincide ? (coincide[2] as PropiedadDeCampo) : undefined
    if (fila && propiedad && PROPIEDADES.includes(propiedad)) {
      errores.filas[fila.uid] = { ...errores.filas[fila.uid], [propiedad]: e.motivo }
    } else {
      sobrantes.push(e)
    }
  }
  const aviso =
    sobrantes.length === 0
      ? null
      : new ErrorApi(error.estado, error.message, sobrantes, error.esperarSegundos)
  return { errores, aviso }
}
