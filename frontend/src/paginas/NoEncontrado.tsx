import { Link } from 'react-router-dom'

export default function NoEncontrado() {
  return (
    <main>
      <h1>Página no encontrada</h1>
      <p>
        <Link to="/">Volver al inicio</Link>
      </p>
    </main>
  )
}
