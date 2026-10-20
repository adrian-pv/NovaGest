import { Link } from 'react-router-dom'
import Aviso from '../componentes/Aviso'
import { useTitulo } from '../componentes/useTitulo'

export default function SinPermiso() {
  useTitulo('Sin permiso')
  return (
    <section className="tarjeta pagina-estrecha">
      <h1>Sin permiso</h1>
      <Aviso tipo="advertencia">
        <p>Tu rol no tiene acceso a esta página.</p>
      </Aviso>
      <p>
        <Link to="/panel">Volver a mi panel</Link>
      </p>
    </section>
  )
}
