import { solicitar } from './cliente'
import type { Perfil, TokenResponse, UsuarioRegistrado } from './tipos'

export interface DatosRegistro {
  nombre: string
  correo: string
  clave: string
}

/** Registro público: siempre crea un ciudadano. */
export function registrar(datos: DatosRegistro): Promise<UsuarioRegistrado> {
  return solicitar<UsuarioRegistrado>('/api/auth/registro', {
    metodo: 'POST',
    cuerpo: datos,
    sinToken: true,
  })
}

export function iniciarSesion(correo: string, clave: string): Promise<TokenResponse> {
  return solicitar<TokenResponse>('/api/auth/login', {
    metodo: 'POST',
    cuerpo: { correo, clave },
    sinToken: true,
  })
}

/** Cambia un token de renovación (de un solo uso) por un par nuevo. */
export function renovarTokens(refreshToken: string): Promise<TokenResponse> {
  return solicitar<TokenResponse>('/api/auth/refresh', {
    metodo: 'POST',
    cuerpo: { refreshToken },
    sinToken: true,
  })
}

/** Cierra la sesión del token de renovación indicado; sin él cierra todas las sesiones del usuario. */
export function cerrarSesionApi(refreshToken?: string): Promise<void> {
  return solicitar<void>('/api/auth/logout', {
    metodo: 'POST',
    cuerpo: refreshToken ? { refreshToken } : {},
  })
}

export function consultarPerfil(): Promise<Perfil> {
  return solicitar<Perfil>('/api/usuarios/yo')
}
