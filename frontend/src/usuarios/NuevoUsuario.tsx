import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { crearUsuario, listarRoles } from '../api/usuarios'
import AvisoError from '../componentes/AvisoError'
import Cargando from '../componentes/Cargando'
import { useDatos } from '../componentes/useDatos'
import { useTitulo } from '../componentes/useTitulo'
import FormularioUsuario from './FormularioUsuario'
import { formularioVacio } from './formulario'

export default function NuevoUsuario() {
  useTitulo('Nuevo usuario')
  const navegar = useNavigate()
  const roles = useDatos('roles', (senal) => listarRoles(senal))
  const inicial = useMemo(() => formularioVacio(), [])
  return (
    <>
      <div className="encabezado-pagina">
        <h1>Nuevo usuario</h1>
        <p>Crea la cuenta y elige qué puede hacer en el sistema.</p>
      </div>
      {roles.error ? (
        <>
          <AvisoError error={roles.error} />
          <Link to="/usuarios">Volver a los usuarios</Link>
        </>
      ) : !roles.datos ? (
        <Cargando texto="Cargando roles..." />
      ) : (
        <FormularioUsuario
          modo="crear"
          inicial={inicial}
          roles={roles.datos}
          onGuardar={async (solicitud) => {
            const creado = await crearUsuario(solicitud)
            void navegar('/usuarios', {
              state: { aviso: `Creamos la cuenta de ${creado.nombre}.` },
            })
          }}
        />
      )}
    </>
  )
}
