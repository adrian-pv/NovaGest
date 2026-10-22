import type { Rol } from '../api/usuarios'
import PermisosDeRol from './PermisosDeRol'
import { textoDeAlcance } from './permisos'

interface Props {
  roles: Rol[]
  elegidos: string[]
  onCambio: (nombre: string, elegido: boolean) => void
  /** Bloquea los cambios (por ejemplo en la cuenta propia). */
  deshabilitado?: boolean
  error?: string
}

/**
 * Casillas para elegir los roles de una persona. Cada rol dice qué ve y deja desplegar sus permisos, para decidir
 * sabiendo lo que se está dando.
 */
export default function SelectorDeRoles({
  roles,
  elegidos,
  onCambio,
  deshabilitado,
  error,
}: Props) {
  return (
    <fieldset
      className="selector-roles"
      disabled={deshabilitado}
      aria-invalid={error ? 'true' : undefined}
    >
      <legend>Roles</legend>
      {roles.map((rol) => (
        <div key={rol.id} className="rol-opcion">
          <label>
            <input
              type="checkbox"
              checked={elegidos.includes(rol.nombre)}
              onChange={(e) => onCambio(rol.nombre, e.target.checked)}
            />{' '}
            <strong>{rol.nombre}</strong>
          </label>
          {rol.descripcion && <p className="campo__ayuda">{rol.descripcion}</p>}
          <p className="campo__ayuda">{textoDeAlcance(rol.alcanceTotal)}.</p>
          <details>
            <summary>Ver permisos de {rol.nombre}</summary>
            <PermisosDeRol permisos={rol.permisos} />
          </details>
        </div>
      ))}
      {error && <p className="campo__error">{error}</p>}
    </fieldset>
  )
}
