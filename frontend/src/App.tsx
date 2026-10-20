import { Route, Routes } from 'react-router-dom'
import Diseno from './componentes/Diseno'
import Ingresar from './paginas/Ingresar'
import Inicio from './paginas/Inicio'
import NoEncontrado from './paginas/NoEncontrado'
import Panel from './paginas/Panel'
import Registro from './paginas/Registro'
import RutaProtegida from './sesion/RutaProtegida'

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
        <Route path="*" element={<NoEncontrado />} />
      </Route>
    </Routes>
  )
}
