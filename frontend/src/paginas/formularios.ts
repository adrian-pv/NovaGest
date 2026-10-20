import { ErrorApi } from '../api/errores'

/** Mensaje que se muestra al fallar una llamada: el del servidor si es un ErrorApi, genérico si no. */
export function mensajeDeError(error: unknown): string {
  return error instanceof ErrorApi
    ? error.message
    : 'Ocurrió un error inesperado. Intenta de nuevo.'
}

/** Motivo que el servidor dio para un campo, si lo hubo. Nunca incluye el valor que la persona escribió. */
export function motivoDeCampo(error: unknown, campo: string): string | undefined {
  if (!(error instanceof ErrorApi)) return undefined
  return error.errores.find((e) => e.campo === campo)?.motivo
}

/**
 * Solo se vuelve a rutas internas ("/algo"): una ruta como "//sitio.com" o "https://..." podría llevar a otro sitio
 * si alguien manipula el estado de navegación.
 */
export function rutaInternaSegura(ruta: unknown, respaldo: string): string {
  return typeof ruta === 'string' && /^\/(?!\/)[^\s\\]*$/.test(ruta) ? ruta : respaldo
}
