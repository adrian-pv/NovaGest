import { ErrorApi } from '../api/errores'
import type {
  SolicitudUsuarioActualizar,
  SolicitudUsuarioCrear,
  UsuarioAdmin,
} from '../api/usuarios'

/** Límites del backend (UsuarioCrearRequest y UsuarioActualizarRequest). La API vuelve a comprobarlos. */
export const MAX_ROLES = 10
const MAX_NOMBRE = 120
const MAX_CORREO = 254
const MIN_CLAVE = 8
const MAX_CLAVE = 72

/** Forma mínima de un correo: algo@algo.algo, sin espacios. El formato exacto lo decide la API. */
const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Lo que la persona tiene escrito en el formulario de un usuario. */
export interface FormUsuario {
  nombre: string
  correo: string
  clave: string
  activo: boolean
  roles: string[]
}

export interface ErroresUsuario {
  nombre?: string
  correo?: string
  clave?: string
  roles?: string
}

export function formularioVacio(): FormUsuario {
  return { nombre: '', correo: '', clave: '', activo: true, roles: [] }
}

export function desdeUsuario(usuario: UsuarioAdmin): FormUsuario {
  return {
    nombre: usuario.nombre,
    correo: usuario.correo,
    clave: '',
    activo: usuario.activo,
    roles: [...usuario.roles],
  }
}

/** Agrega o quita un rol de la selección, sin repetir y sin pasar del máximo. */
export function alternarRol(roles: string[], nombre: string, elegido: boolean): string[] {
  const sinEste = roles.filter((r) => r !== nombre)
  if (!elegido) return sinEste
  return roles.length >= MAX_ROLES && !roles.includes(nombre) ? roles : [...sinEste, nombre]
}

function errorDeNombre(nombre: string): string | undefined {
  if (!nombre.trim()) return 'Escribe el nombre.'
  if (nombre.trim().length > MAX_NOMBRE) return `Máximo ${MAX_NOMBRE} caracteres.`
  return undefined
}

function errorDeRoles(roles: string[]): string | undefined {
  if (roles.length === 0) return 'Elige al menos un rol.'
  if (roles.length > MAX_ROLES) return `Máximo ${MAX_ROLES} roles.`
  return undefined
}

function sinErrores(errores: ErroresUsuario): boolean {
  return Object.values(errores).every((e) => e === undefined)
}

export interface ValidacionCreacion {
  errores: ErroresUsuario
  /** Solo existe si no hay ningún error. */
  solicitud?: SolicitudUsuarioCrear
}

export interface ValidacionEdicion {
  errores: ErroresUsuario
  solicitud?: SolicitudUsuarioActualizar
}

/**
 * Revisa lo escrito al crear un usuario con las reglas del backend. La clave no se recorta (los espacios cuentan) y
 * nunca aparece en un mensaje de error.
 */
export function validarCreacion(form: FormUsuario): ValidacionCreacion {
  const errores: ErroresUsuario = {
    nombre: errorDeNombre(form.nombre),
    roles: errorDeRoles(form.roles),
  }
  const correo = form.correo.trim()
  if (!correo) errores.correo = 'Escribe el correo.'
  else if (correo.length > MAX_CORREO) errores.correo = `Máximo ${MAX_CORREO} caracteres.`
  else if (!CORREO_VALIDO.test(correo)) errores.correo = 'Escribe un correo con formato válido.'
  if (!form.clave) errores.clave = 'Escribe una clave.'
  else if (form.clave.length < MIN_CLAVE) errores.clave = `Mínimo ${MIN_CLAVE} caracteres.`
  else if (form.clave.length > MAX_CLAVE) errores.clave = `Máximo ${MAX_CLAVE} caracteres.`
  if (!sinErrores(errores)) return { errores }
  return {
    errores,
    solicitud: { nombre: form.nombre.trim(), correo, clave: form.clave, roles: form.roles },
  }
}

/** Al editar solo cambian el nombre, el estado y los roles: el correo y la clave no se tocan aquí. */
export function validarEdicion(form: FormUsuario): ValidacionEdicion {
  const errores: ErroresUsuario = {
    nombre: errorDeNombre(form.nombre),
    roles: errorDeRoles(form.roles),
  }
  if (!sinErrores(errores)) return { errores }
  return {
    errores,
    solicitud: { nombre: form.nombre.trim(), activo: form.activo, roles: form.roles },
  }
}

const CAMPOS_CONOCIDOS: (keyof ErroresUsuario)[] = ['nombre', 'correo', 'clave', 'roles']

export interface ErroresDelServidor {
  errores: ErroresUsuario
  /**
   * Lo que hay que mostrar en un aviso porque no cabe junto a ningún campo (el 409 de "No puedes cambiar tus propios
   * roles", un correo repetido, un fallo de red...): el mismo error, solo con los detalles que no se pudieron ubicar.
   */
  aviso: unknown
}

/** Pone junto a su entrada los errores por campo de la API; lo demás va al aviso para que nada se pierda. */
export function erroresDelServidor(error: unknown): ErroresDelServidor {
  const errores: ErroresUsuario = {}
  if (!(error instanceof ErrorApi) || error.errores.length === 0) return { errores, aviso: error }
  const sobrantes = error.errores.filter((e) => {
    const campo = CAMPOS_CONOCIDOS.find((c) => c === e.campo)
    if (!campo) return true
    errores[campo] = e.motivo
    return false
  })
  const aviso =
    sobrantes.length === 0
      ? null
      : new ErrorApi(error.estado, error.message, sobrantes, error.esperarSegundos)
  return { errores, aviso }
}
