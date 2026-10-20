import { Route, Routes } from 'react-router-dom'
import Ingresar from './paginas/Ingresar'
import Inicio from './paginas/Inicio'
import NoEncontrado from './paginas/NoEncontrado'
import Panel from './paginas/Panel'
import Registro from './paginas/Registro'
import RutaProtegida from './sesion/RutaProtegida'

/**
 * Rutas de la aplicación. Las que exigen sesión van dentro de RutaProtegida; para exigir además un permiso:
 * <Route element={<RutaProtegida permiso="tramite:leer" />}>. Las pantallas de cada flujo se agregan aquí
 * (tarjetas 32 a 40).
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Inicio />} />
      <Route path="/ingresar" element={<Ingresar />} />
      <Route path="/registro" element={<Registro />} />
      <Route element={<RutaProtegida />}>
        <Route path="/panel" element={<Panel />} />
      </Route>
      <Route path="*" element={<NoEncontrado />} />
    </Routes>
  )
}
