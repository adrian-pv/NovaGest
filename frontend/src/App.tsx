import { Route, Routes } from 'react-router-dom'
import Diseno from './componentes/Diseno'
import Ingresar from './paginas/Ingresar'
import Inicio from './paginas/Inicio'
import NoEncontrado from './paginas/NoEncontrado'
import Panel from './paginas/Panel'
import Registro from './paginas/Registro'
import RutaProtegida from './sesion/RutaProtegida'
import Bandeja from './tramites/Bandeja'
import DetalleTramite from './tramites/DetalleTramite'
import EditarTramite from './tramites/EditarTramite'
import ListaTramites from './tramites/ListaTramites'
import NuevoTramite from './tramites/NuevoTramite'

/**
 * Rutas de la aplicación. Todas se dibujan dentro del marco común (Diseno). Las que exigen sesión van dentro de
 * RutaProtegida; para exigir además un permiso: <Route element={<RutaProtegida permiso="tramite:leer" />}>.
 * Al agregar una pantalla, agrega también su enlace en src/sesion/navegacion.ts.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<Diseno />}>
        <Route path="/" element={<Inicio />} />
        <Route path="/ingresar" element={<Ingresar />} />
        <Route path="/registro" element={<Registro />} />
        <Route element={<RutaProtegida />}>
          <Route path="/panel" element={<Panel />} />
        </Route>
        <Route element={<RutaProtegida permiso="tramite:leer" alcanceTotal />}>
          <Route path="/bandeja" element={<Bandeja />} />
        </Route>
        <Route element={<RutaProtegida permiso="tramite:leer" />}>
          <Route path="/tramites" element={<ListaTramites />} />
          <Route path="/tramites/:id" element={<DetalleTramite />} />
        </Route>
        <Route element={<RutaProtegida permiso="tramite:crear" />}>
          <Route path="/tramites/nuevo" element={<NuevoTramite />} />
        </Route>
        <Route element={<RutaProtegida permiso="tramite:editar" />}>
          <Route path="/tramites/:id/editar" element={<EditarTramite />} />
        </Route>
        <Route path="*" element={<NoEncontrado />} />
      </Route>
    </Routes>
  )
}
