import { Route, Routes } from 'react-router-dom'
import Inicio from './paginas/Inicio'
import NoEncontrado from './paginas/NoEncontrado'

/** Rutas de la aplicación. Las pantallas de cada flujo se agregan aquí (tarjetas 31 a 40). */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Inicio />} />
      <Route path="*" element={<NoEncontrado />} />
    </Routes>
  )
}
