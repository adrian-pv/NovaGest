import { Link } from 'react-router-dom'

export default function SinPermiso() {
  return (
    <main>
      <h1>Sin permiso</h1>
      <p>Tu rol no tiene acceso a esta página.</p>
      <p>
        <Link to="/panel">Volver a mi panel</Link>
      </p>
    </main>
  )
}
