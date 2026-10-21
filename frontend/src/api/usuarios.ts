import { solicitar } from './cliente'
import type { Pagina } from './tipos'

/** Un usuario tal como lo ve quien administra (GET /api/usuarios). Nunca trae la clave. */
export interface UsuarioAdmin {
  id: number
  correo: string
  nombre: string
  activo: boolean
  /** Si la cuenta está bloqueada ahora mismo por intentos fallidos de inicio de sesión. */
  bloqueado: boolean
  roles: string[]
  creadoEn: string
  actualizadoEn: string
}

/** Un rol con sus permisos en formato recurso:accion, por ejemplo tramite:leer. */
export interface Rol {
  id: number
  nombre: string
  descripcion: string | null
  /** Si el rol ve los registros de todas las personas (true) o solo los propios (false). */
  alcanceTotal: boolean
  permisos: string[]
}

export interface FiltroUsuarios {
  buscar?: string
  rol?: string
  activo?: boolean
  page?: number
}

/** Cuerpo para editar: reemplaza el nombre, el estado y la lista completa de roles (por nombre). */
export interface SolicitudUsuarioActualizar {
  nombre: string
  activo: boolean
  roles: string[]
}

export interface SolicitudUsuarioCrear {
  nombre: string
  correo: string
  clave: string
  roles: string[]
}

/** Usuarios de 20 en 20, por nombre. `buscar` mira el nombre y el correo; `rol` es el nombre exacto, por ejemplo GESTOR. */
export function listarUsuarios(
  filtro: FiltroUsuarios,
  senal?: AbortSignal,
): Promise<Pagina<UsuarioAdmin>> {
  return solicitar<Pagina<UsuarioAdmin>>('/api/usuarios', {
    consulta: {
      buscar: filtro.buscar,
      rol: filtro.rol,
      activo: filtro.activo,
      page: filtro.page ?? 0,
      sort: 'nombre,asc',
    },
    senal,
  })
}

export function obtenerUsuario(id: number, senal?: AbortSignal): Promise<UsuarioAdmin> {
  return solicitar<UsuarioAdmin>(`/api/usuarios/${id}`, { senal })
}

export function crearUsuario(solicitud: SolicitudUsuarioCrear): Promise<UsuarioAdmin> {
  return solicitar<UsuarioAdmin>('/api/usuarios', { metodo: 'POST', cuerpo: solicitud })
}

export function actualizarUsuario(
  id: number,
  solicitud: SolicitudUsuarioActualizar,
): Promise<UsuarioAdmin> {
  return solicitar<UsuarioAdmin>(`/api/usuarios/${id}`, { metodo: 'PUT', cuerpo: solicitud })
}

/** Quita el bloqueo por intentos fallidos antes de que venza solo. */
export function desbloquearUsuario(id: number): Promise<UsuarioAdmin> {
  return solicitar<UsuarioAdmin>(`/api/usuarios/${id}/desbloquear`, { metodo: 'POST' })
}

/** Todos los roles con sus permisos (exige rol:leer). Son pocos: no se pagina. */
export function listarRoles(senal?: AbortSignal): Promise<Rol[]> {
  return solicitar<Rol[]>('/api/roles', { senal })
}
