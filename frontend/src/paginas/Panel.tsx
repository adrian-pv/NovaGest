import { Link } from 'react-router-dom'
import { useSesion } from '../sesion/contexto'

/** Pantalla de entrada tras iniciar sesión. Los accesos a cada flujo se agregan con las tarjetas 32 a 40. */
export default function Panel() {
  const { perfil, cerrarSesion } = useSesion()
  if (!perfil) return null

  return (
    <main>
      <h1>Hola, {perfil.nombre}</h1>
      <p>
        Rol: {perfil.roles.join(', ')}. Ves{' '}
        {perfil.alcanceTotal ? 'los trámites de todos' : 'solo tus trámites'}.
      </p>
      <p>
        <button type="button" onClick={() => void cerrarSesion()}>
          Cerrar sesión
        </button>
      </p>
      <p>
        <Link to="/">Inicio</Link>
      </p>
    </main>
  )
}
