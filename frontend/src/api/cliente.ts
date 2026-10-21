import { ErrorApi } from './errores'
import { leerToken } from './token'

const BASE = import.meta.env.VITE_API_BASE_URL ?? ''

type Metodo = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface Opciones {
  metodo?: Metodo
  /** Cuerpo JSON. Para archivos usar `formulario`. */
  cuerpo?: unknown
  /** Cuerpo multipart (por ejemplo el comprobante de pago). El navegador pone el Content-Type. */
  formulario?: FormData
  /** Parámetros de consulta; se ignoran los vacíos. */
  consulta?: Record<string, string | number | boolean | undefined | null>
  /** Rutas públicas (login, registro, salud): no se envía el token ni se intenta renovar la sesión. */
  sinToken?: boolean
  senal?: AbortSignal
}

/** Intenta renovar la sesión; devuelve verdadero si quedó un token de acceso nuevo. */
type Renovador = () => Promise<boolean>

let renovador: Renovador | null = null

/**
 * Registra quién renueva la sesión cuando el servidor responde 401 a una llamada autenticada. El cliente
 * reintenta la llamada una sola vez con el token nuevo. La renovación debe ser de una sola ejecución a la vez:
 * el token de renovación es de un solo uso y reusarlo revoca todas las sesiones.
 */
export function configurarRenovador(nuevo: Renovador | null): void {
  renovador = nuevo
}

function construirUrl(ruta: string, consulta: Opciones['consulta']): string {
  const url = `${BASE}${ruta}`
  if (!consulta) return url
  const parametros = new URLSearchParams()
  for (const [clave, valor] of Object.entries(consulta)) {
    if (valor !== undefined && valor !== null && valor !== '') parametros.set(clave, String(valor))
  }
  const texto = parametros.toString()
  return texto ? `${url}?${texto}` : url
}

async function ejecutar<T>(
  ruta: string,
  opciones: Opciones,
  leer: (respuesta: Response) => Promise<T>,
  aceptar = 'application/json',
): Promise<T> {
  const cabeceras: Record<string, string> = { Accept: aceptar }
  const token = opciones.sinToken ? null : leerToken()
  if (token) cabeceras.Authorization = `Bearer ${token}`

  let cuerpo: BodyInit | undefined
  if (opciones.formulario) {
    cuerpo = opciones.formulario
  } else if (opciones.cuerpo !== undefined) {
    cabeceras['Content-Type'] = 'application/json'
    cuerpo = JSON.stringify(opciones.cuerpo)
  }

  let respuesta: Response
  try {
    respuesta = await fetch(construirUrl(ruta, opciones.consulta), {
      method: opciones.metodo ?? 'GET',
      headers: cabeceras,
      body: cuerpo,
      signal: opciones.senal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw ErrorApi.sinConexion()
  }

  if (!respuesta.ok) throw await ErrorApi.desdeRespuesta(respuesta)
  return leer(respuesta)
}

async function leerJson<T>(respuesta: Response): Promise<T> {
  return respuesta.status === 204 ? (undefined as T) : ((await respuesta.json()) as T)
}

/** Si una llamada autenticada recibe 401 se renueva la sesión y se reintenta una sola vez. */
async function conRenovacion<T>(opciones: Opciones, intento: () => Promise<T>): Promise<T> {
  try {
    return await intento()
  } catch (error) {
    const sinAutorizacion = error instanceof ErrorApi && error.estado === 401
    if (!sinAutorizacion || opciones.sinToken || !renovador) throw error
    if (!(await renovador())) throw error
    return intento()
  }
}

/**
 * Única puerta de salida hacia la API. Agrega el token, serializa el cuerpo y convierte cualquier fallo
 * (error HTTP o red caída) en un ErrorApi. Si una llamada autenticada recibe 401 se renueva la sesión y se
 * reintenta una vez. Ni el token ni los cuerpos se escriben en la consola.
 */
export function solicitar<T>(ruta: string, opciones: Opciones = {}): Promise<T> {
  return conRenovacion(opciones, () => ejecutar(ruta, opciones, leerJson<T>))
}

/** Un archivo descargado de la API y el nombre que esta sugirió, ya depurado. */
export interface ArchivoDescargado {
  contenido: Blob
  nombre: string | null
}

/**
 * Nombre de archivo de la cabecera Content-Disposition. Solo se aceptan letras, números, punto, guion y guion
 * bajo: cualquier otra cosa (rutas, espacios, caracteres de control) se descarta para no guardar un archivo con un
 * nombre manipulado.
 */
export function nombreDeDescarga(cabecera: string | null): string | null {
  const coincidencia = cabecera ? /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cabecera) : null
  const nombre = coincidencia?.[1]?.trim()
  return nombre && /^[A-Za-z0-9._-]{1,100}$/.test(nombre) && !nombre.startsWith('.') ? nombre : null
}

/**
 * Descarga un archivo que exige sesión (no puede ser un enlace simple porque el token va en una cabecera). Pide
 * cualquier tipo de contenido: con Accept: application/json la API respondería 406 a un PDF o una imagen.
 */
export function solicitarArchivo(
  ruta: string,
  opciones: Opciones = {},
): Promise<ArchivoDescargado> {
  return conRenovacion(opciones, () =>
    ejecutar(
      ruta,
      opciones,
      async (respuesta) => ({
        contenido: await respuesta.blob(),
        nombre: nombreDeDescarga(respuesta.headers.get('Content-Disposition')),
      }),
      '*/*',
    ),
  )
}
