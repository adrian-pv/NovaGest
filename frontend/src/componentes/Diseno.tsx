import { Link, Outlet } from 'react-router-dom'
import { useSesion } from '../sesion/contexto'
import Boton from './Boton'
import Insignia from './Insignia'
import Menu from './Menu'

/**
 * Marco común de todas las pantallas: cabecera con menú según el rol y la persona que entró, contenido y pie.
 * Las pantallas se dibujan dentro de <main>, así que no deben abrir su propio <main>.
 */
export default function Diseno() {
  const { estado, perfil, cerrarSesion } = useSesion()
  return (
    <div className="app">
      <a className="saltar" href="#contenido">
        Saltar al contenido
      </a>
      <header className="cabecera">
        <div className="cabecera__contenido">
          <Link to="/" className="marca">
            NovaGest
          </Link>
          <Menu />
          <div className="usuario">
            {estado === 'autenticado' && perfil && (
              <>
                <span className="usuario__nombre">
                  {perfil.nombre}
                  <Insignia>{perfil.roles.join(', ')}</Insignia>
                </span>
                <Boton variante="secundario" onClick={() => void cerrarSesion()}>
                  Cerrar sesión
                </Boton>
              </>
            )}
            {estado === 'anonimo' && (
              <>
                <Link className="boton boton--secundario" to="/ingresar">
                  Iniciar sesión
                </Link>
                <Link className="boton boton--secundario" to="/registro">
                  Crear cuenta
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main id="contenido" className="contenido" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="pie">
        NovaGest · Sistema de trámites ciudadanos · Auditoría de Sistemas
      </footer>
    </div>
  )
}
