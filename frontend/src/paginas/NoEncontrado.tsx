import { Link } from 'react-router-dom'
import { useTitulo } from '../componentes/useTitulo'

export default function NoEncontrado() {
  useTitulo('Página no encontrada')
  return (
    <section className="tarjeta pagina-estrecha">
      <h1>Página no encontrada</h1>
      <p>La dirección que buscas no existe o fue movida.</p>
      <p>
        <Link to="/">Volver al inicio</Link>
      </p>
    </section>
  )
}
