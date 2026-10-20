/** Un campo que el servidor rechazó y por qué. Nunca incluye el valor rechazado. */
export interface ErrorDeCampo {
  campo: string
  motivo: string
}

/** Respuesta de error de la API: Problem Details (application/problem+json). */
interface ProblemDetails {
  title?: string
  detail?: string
  status?: number
  errores?: ErrorDeCampo[]
}

const MENSAJES_POR_ESTADO: Record<number, string> = {
  0: 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.',
  400: 'La solicitud tiene datos inválidos.',
  401: 'Tu sesión no es válida o expiró. Inicia sesión de nuevo.',
  403: 'No tienes permiso para hacer esto.',
  404: 'No encontramos lo que buscas.',
  409: 'La operación choca con el estado actual de los datos.',
  429: 'Demasiados intentos. Espera un momento e intenta de nuevo.',
  500: 'Ocurrió un error inesperado en el servidor.',
}

/** Error de una llamada a la API, ya traducido a algo que se puede mostrar a la persona usuaria. */
export class ErrorApi extends Error {
  readonly estado: number
  readonly errores: ErrorDeCampo[]

  constructor(estado: number, mensaje: string, errores: ErrorDeCampo[] = []) {
    super(mensaje)
    this.name = 'ErrorApi'
    this.estado = estado
    this.errores = errores
  }

  /** Construye el error a partir de una respuesta HTTP fallida. Tolera cuerpos que no sean Problem Details. */
  static async desdeRespuesta(respuesta: Response): Promise<ErrorApi> {
    let problema: ProblemDetails = {}
    try {
      problema = (await respuesta.json()) as ProblemDetails
    } catch {
      // Cuerpo vacío o que no es JSON: se usa el mensaje por estado
    }
    const errores = Array.isArray(problema.errores) ? problema.errores : []
    const mensaje =
      problema.detail ??
      MENSAJES_POR_ESTADO[respuesta.status] ??
      'No se pudo completar la operación.'
    return new ErrorApi(respuesta.status, mensaje, errores)
  }

  static sinConexion(): ErrorApi {
    return new ErrorApi(0, MENSAJES_POR_ESTADO[0])
  }
}
