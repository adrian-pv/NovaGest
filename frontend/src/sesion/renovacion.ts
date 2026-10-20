import { renovarTokens } from '../api/auth'
import { ErrorApi } from '../api/errores'
import { guardarToken } from '../api/token'
import type { TokenResponse } from '../api/tipos'
import { borrarRenovacion, guardarRenovacion, leerRenovacion } from './almacen'

type Oyente = () => void

const oyentesDeExpiracion = new Set<Oyente>()

/** Avisa cuando la sesión terminó sin que la persona lo pidiera (token de renovación inválido o vencido). */
export function alExpirarSesion(oyente: Oyente): () => void {
  oyentesDeExpiracion.add(oyente)
  return () => {
    oyentesDeExpiracion.delete(oyente)
  }
}

/** Guarda el par de tokens: el de acceso en memoria y el de renovación en el almacén de la pestaña. */
export function guardarSesion(tokens: TokenResponse): void {
  guardarToken(tokens.accessToken, tokens.expiraEnSegundos)
  guardarRenovacion(tokens.refreshToken)
}

export function olvidarSesion(): void {
  guardarToken(null)
  borrarRenovacion()
}

let enCurso: Promise<boolean> | null = null

/**
 * Cambia el token de renovación por un par nuevo. Es CRÍTICO que nunca corran dos a la vez: el token es de un
 * solo uso y presentar uno ya canjeado hace que la API revoque todas las sesiones del usuario. Por eso todas las
 * llamadas (la recuperación al cargar la página, el doble montaje de React en desarrollo, varias peticiones que
 * reciben 401 a la vez) comparten la misma promesa.
 */
export function renovarSesion(): Promise<boolean> {
  if (enCurso) return enCurso
  const renovacion = leerRenovacion()
  if (!renovacion) return Promise.resolve(false)
  enCurso = renovarTokens(renovacion)
    .then((tokens) => {
      guardarSesion(tokens)
      return true
    })
    .catch((error: unknown) => {
      // Sin conexión no se sabe si el token sirve: se conserva para reintentar. Cualquier otro rechazo
      // (inválido, usado, vencido, cuenta bloqueada) termina la sesión.
      if (!(error instanceof ErrorApi && error.estado === 0)) {
        olvidarSesion()
        oyentesDeExpiracion.forEach((oyente) => oyente())
      }
      return false
    })
    .finally(() => {
      enCurso = null
    })
  return enCurso
}
