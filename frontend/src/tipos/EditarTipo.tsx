import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { actualizarTipo, obtenerTipo } from '../api/tramites'
import AvisoError from '../componentes/AvisoError'
import Cargando from '../componentes/Cargando'
import { useDatos } from '../componentes/useDatos'
import { useTitulo } from '../componentes/useTitulo'
import NoEncontrado from '../paginas/NoEncontrado'
import { idDeRuta } from '../tramites/cargas'
import FormularioTipo from './FormularioTipo'
import { desdeTipo } from './formulario'

export default function EditarTipo() {
  const id = idDeRuta(useParams().id)
  if (id === null) return <NoEncontrado />
  return <Edicion id={id} />
}

function Edicion({ id }: { id: number }) {
  useTitulo('Editar tipo de trámite')
  const navegar = useNavigate()
  const carga = useDatos(String(id), (senal) => obtenerTipo(id, senal))
  const inicial = useMemo(() => (carga.datos ? desdeTipo(carga.datos) : null), [carga.datos])

  if (carga.error) {
    return (
      <>
        <AvisoError error={carga.error} />
        <Link to="/tipos">Volver a los tipos</Link>
      </>
    )
  }
  if (!carga.datos || !inicial) return <Cargando texto="Cargando el tipo..." />
  return (
    <>
      <div className="encabezado-pagina">
        <h1>Editar «{carga.datos.nombre}»</h1>
        <p>Los trámites que ya existen conservan los datos que ya llenaron.</p>
      </div>
      <FormularioTipo
        inicial={inicial}
        textoGuardar="Guardar cambios"
        onGuardar={async (solicitud) => {
          const guardado = await actualizarTipo(id, solicitud)
          void navegar('/tipos', { state: { aviso: `Guardamos «${guardado.nombre}».` } })
        }}
      />
    </>
  )
}
