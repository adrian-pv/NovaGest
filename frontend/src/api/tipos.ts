/** Página de resultados de Spring Data, tal como la devuelve la API. */
export interface Pagina<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

export interface Salud {
  status: 'UP' | 'DOWN'
}

/** Par de tokens que entrega el login y la renovación. */
export interface TokenResponse {
  accessToken: string
  refreshToken: string
  tipo: string
  expiraEnSegundos: number
}

/** Quien está autenticado, con los permisos que tiene ahora mismo (GET /api/usuarios/yo). */
export interface Perfil {
  id: number
  correo: string
  nombre: string
  roles: string[]
  /** Formato recurso:accion, por ejemplo tramite:leer. */
  permisos: string[]
  /** Si sus roles ven los registros de todos (true) o solo los propios (false). */
  alcanceTotal: boolean
}

export interface UsuarioRegistrado {
  id: number
  correo: string
  nombre: string
  roles: string[]
}
