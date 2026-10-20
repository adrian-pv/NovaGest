import { createContext, useContext } from 'react'
import type { Perfil } from '../api/tipos'

export type EstadoSesion = 'cargando' | 'anonimo' | 'autenticado'

export interface ValorSesion {
  estado: EstadoSesion
  perfil: Perfil | null
  /** Lanza ErrorApi si las credenciales no sirven. */
  iniciarSesion: (correo: string, clave: string) => Promise<void>
  cerrarSesion: () => Promise<void>
  /** La interfaz solo oculta lo que no corresponde; el control real está en la API. */
  tienePermiso: (permiso: string) => boolean
}

export const ContextoSesion = createContext<ValorSesion | null>(null)

export function useSesion(): ValorSesion {
  const valor = useContext(ContextoSesion)
  if (!valor) throw new Error('useSesion debe usarse dentro de ProveedorSesion')
  return valor
}
