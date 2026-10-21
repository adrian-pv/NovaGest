/** Datos de paginación que la API anida en `page`. `number` empieza en 0. */
export interface DatosDePagina {
  size: number
  number: number
  totalElements: number
  totalPages: number
}

/**
 * Página de resultados tal como la devuelve la API: los elementos en `content` y la paginación dentro de `page`
 * (Spring Data en modo VIA_DTO). OJO: no vienen planos; verificado contra el backend real.
 */
export interface Pagina<T> {
  content: T[]
  page: DatosDePagina
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
