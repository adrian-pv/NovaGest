import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { actualizarUsuario, listarRoles, obtenerUsuario } from '../api/usuarios'
import AvisoError from '../componentes/AvisoError'
import Cargando from '../componentes/Cargando'
import { useDatos } from '../componentes/useDatos'
import { useTitulo } from '../componentes/useTitulo'
import NoEncontrado from '../paginas/NoEncontrado'
import { useSesion } from '../sesion/contexto'
import { idDeRuta } from '../tramites/cargas'
import FormularioUsuario from './FormularioUsuario'
import { desdeUsuario } from './formulario'

export default function EditarUsuario() {
  const id = idDeRuta(useParams().id)
  if (id === null) return <NoEncontrado />
  return <Edicion id={id} />
}

function Edicion({ id }: { id: number }) {
  useTitulo('Editar usuario')
  const navegar = useNavigate()
  const { perfil } = useSesion()
  const carga = useDatos(String(id), (senal) =>
    Promise.all([obtenerUsuario(id, senal), listarRoles(senal)]),
  )
  const inicial = useMemo(() => (carga.datos ? desdeUsuario(carga.datos[0]) : null), [carga.datos])

  if (carga.error) {
    return (
      <>
        <AvisoError error={carga.error} />
        <Link to="/usuarios">Volver a los usuarios</Link>
      </>
    )
  }
  if (!carga.datos || !inicial) return <Cargando texto="Cargando el usuario..." />
  const [usuario, roles] = carga.datos
  return (
    <>
      <div className="encabezado-pagina">
        <h1>Editar a {usuario.nombre}</h1>
        <p>Cambia el nombre, activa o desactiva la cuenta y elige sus roles.</p>
      </div>
      <FormularioUsuario
        modo="editar"
        inicial={inicial}
        roles={roles}
        propio={perfil?.id === usuario.id}
        onGuardar={async (solicitud) => {
          const guardado = await actualizarUsuario(id, solicitud)
          void navegar('/usuarios', {
            state: { aviso: `Guardamos los cambios de ${guardado.nombre}.` },
          })
        }}
      />
    </>
  )
}
