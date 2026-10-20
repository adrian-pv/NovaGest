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
  500: 'Ocurrió un error inesperado en el servidor. Intenta de nuevo en unos minutos.',
}

const TITULOS_POR_ESTADO: Record<number, string> = {
  0: 'Sin conexión',
  400: 'Revisa los datos',
  401: 'Sesión no válida',
  403: 'Sin permiso',
  404: 'No encontrado',
  409: 'No se pudo completar',
  429: 'Demasiados intentos',
}

/** Segundos de espera que pide la API en Retry-After. Solo se entiende el formato de segundos enteros. */
function leerEspera(valor: string | null): number | undefined {
  if (!valor || !/^\d{1,5}$/.test(valor.trim())) return undefined
  const segundos = Number(valor)
  return segundos > 0 ? segundos : undefined
}

/**
 * Error de una llamada a la API, ya traducido a algo que se puede mostrar a la persona usuaria.
 * Regla: ante un error del servidor (5xx) jamás se muestra lo que diga el servidor ni el proxy, solo un mensaje
 * general; el detalle real queda en el log del servidor.
 */
export class ErrorApi extends Error {
  readonly estado: number
  readonly errores: ErrorDeCampo[]
  /** Segundos que la API pidió esperar antes de reintentar (cabecera Retry-After), si los pidió. */
  readonly esperarSegundos?: number

  constructor(
    estado: number,
    mensaje: string,
    errores: ErrorDeCampo[] = [],
    esperarSegundos?: number,
  ) {
    super(mensaje)
    this.name = 'ErrorApi'
    this.estado = estado
    this.errores = errores
    this.esperarSegundos = esperarSegundos
  }

  /** Título corto para mostrar sobre el mensaje. */
  get titulo(): string {
    return (
      TITULOS_POR_ESTADO[this.estado] ??
      (this.estado >= 500 ? 'Error del servidor' : 'No se pudo completar')
    )
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
    const espera = leerEspera(respuesta.headers.get('Retry-After'))

    let mensaje: string
    if (respuesta.status >= 500) {
      mensaje = MENSAJES_POR_ESTADO[500]
    } else if (respuesta.status === 429) {
      mensaje = espera
        ? `Demasiados intentos. Espera ${espera} segundos e intenta de nuevo.`
        : MENSAJES_POR_ESTADO[429]
    } else {
      mensaje =
        problema.detail ??
        MENSAJES_POR_ESTADO[respuesta.status] ??
        'No se pudo completar la operación.'
    }
    return new ErrorApi(respuesta.status, mensaje, respuesta.status >= 500 ? [] : errores, espera)
  }

  static sinConexion(): ErrorApi {
    return new ErrorApi(0, MENSAJES_POR_ESTADO[0])
  }
}
