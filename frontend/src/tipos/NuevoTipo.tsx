import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { crearTipo } from '../api/tramites'
import { useTitulo } from '../componentes/useTitulo'
import FormularioTipo from './FormularioTipo'
import { formularioVacio } from './formulario'

export default function NuevoTipo() {
  useTitulo('Nuevo tipo de trámite')
  const navegar = useNavigate()
  const inicial = useMemo(() => formularioVacio(), [])
  return (
    <>
      <div className="encabezado-pagina">
        <h1>Nuevo tipo de trámite</h1>
        <p>Define el nombre, el costo y los datos que se pedirán.</p>
      </div>
      <FormularioTipo
        inicial={inicial}
        textoGuardar="Crear tipo"
        onGuardar={async (solicitud) => {
          const creado = await crearTipo(solicitud)
          void navegar('/tipos', { state: { aviso: `Creamos el tipo «${creado.nombre}».` } })
        }}
      />
    </>
  )
}
