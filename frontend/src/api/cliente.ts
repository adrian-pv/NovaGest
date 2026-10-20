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
  /** Rutas públicas (login, registro, salud): no se envía el token. */
  sinToken?: boolean
  senal?: AbortSignal
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

/**
 * Única puerta de salida hacia la API. Agrega el token, serializa el cuerpo y convierte cualquier fallo
 * (error HTTP o red caída) en un ErrorApi. Ni el token ni los cuerpos se escriben en la consola.
 */
export async function solicitar<T>(ruta: string, opciones: Opciones = {}): Promise<T> {
  const cabeceras: Record<string, string> = { Accept: 'application/json' }
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
  if (respuesta.status === 204) return undefined as T
  return (await respuesta.json()) as T
}
