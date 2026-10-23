import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { actualizarIngreso, obtenerIngreso } from '../api/ingresos'
import AvisoError from '../componentes/AvisoError'
import Cargando from '../componentes/Cargando'
import { useDatos } from '../componentes/useDatos'
import { useTitulo } from '../componentes/useTitulo'
import { soloFecha } from '../formato'
import NoEncontrado from '../paginas/NoEncontrado'
import { idDeRuta } from '../tramites/cargas'
import FormularioIngreso from './FormularioIngreso'
import { desdeIngreso } from './formulario'

export default function EditarIngreso() {
  const id = idDeRuta(useParams().id)
  if (id === null) return <NoEncontrado />
  return <Edicion id={id} />
}

function Edicion({ id }: { id: number }) {
  useTitulo('Editar ingreso')
  const navegar = useNavigate()
  const carga = useDatos(String(id), (senal) => obtenerIngreso(id, senal))
  const inicial = useMemo(() => (carga.datos ? desdeIngreso(carga.datos) : null), [carga.datos])

  if (carga.error) {
    return (
      <>
        <AvisoError error={carga.error} />
        <Link to="/ingresos">Volver a mis ingresos</Link>
      </>
    )
  }
  if (!carga.datos || !inicial) return <Cargando texto="Cargando el ingreso..." />
  return (
    <>
      <div className="encabezado-pagina">
        <h1>Editar ingreso del {soloFecha(carga.datos.fecha)}</h1>
        <p>Los cambios se reflejan de inmediato en tus proyecciones.</p>
      </div>
      <FormularioIngreso
        inicial={inicial}
        textoGuardar="Guardar cambios"
        onGuardar={async (solicitud) => {
          await actualizarIngreso(id, solicitud)
          void navegar('/ingresos', { state: { aviso: 'Guardamos los cambios del ingreso.' } })
        }}
      />
    </>
  )
}
