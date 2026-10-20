import { Navigate, Outlet, useLocation } from 'react-router-dom'
import Cargando from '../componentes/Cargando'
import SinPermiso from '../paginas/SinPermiso'
import { useSesion } from './contexto'

/**
 * Agrupa rutas que exigen sesión y, opcionalmente, un permiso. Sin sesión lleva a /ingresar y recuerda a dónde
 * volver; con sesión pero sin el permiso muestra "sin permiso". Es solo comodidad de la interfaz: la API vuelve a
 * comprobar el permiso en cada llamada.
 */
export default function RutaProtegida({ permiso }: { permiso?: string }) {
  const { estado, tienePermiso } = useSesion()
  const ubicacion = useLocation()

  if (estado === 'cargando') return <Cargando texto="Cargando sesión..." />
  if (estado === 'anonimo') {
    return (
      <Navigate to="/ingresar" replace state={{ desde: ubicacion.pathname + ubicacion.search }} />
    )
  }
  if (permiso && !tienePermiso(permiso)) return <SinPermiso />
  return <Outlet />
}
