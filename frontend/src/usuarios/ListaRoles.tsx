import { listarRoles } from '../api/usuarios'
import AvisoError from '../componentes/AvisoError'
import Boton from '../componentes/Boton'
import Cargando from '../componentes/Cargando'
import { useDatos } from '../componentes/useDatos'
import { useTitulo } from '../componentes/useTitulo'
import PermisosDeRol from './PermisosDeRol'
import { textoDeAlcance } from './permisos'

/** Qué puede hacer cada rol: su descripción, su alcance y sus permisos agrupados. Solo lectura. */
export default function ListaRoles() {
  useTitulo('Roles y permisos')
  const roles = useDatos('roles', (senal) => listarRoles(senal))
  return (
    <>
      <div className="encabezado-pagina">
        <h1>Roles y permisos</h1>
        <p>Lo que puede hacer cada rol, según los permisos que tiene asignados.</p>
      </div>
      {roles.error ? (
        <div>
          <AvisoError error={roles.error} />
          <Boton variante="secundario" onClick={roles.recargar}>
            Reintentar
          </Boton>
        </div>
      ) : !roles.datos ? (
        <Cargando texto="Cargando roles..." />
      ) : roles.datos.length === 0 ? (
        <p className="vacio">No hay roles registrados.</p>
      ) : (
        <div className="rejilla">
          {roles.datos.map((rol) => (
            <section key={rol.id} className="tarjeta" aria-labelledby={`rol-${rol.id}`}>
              <h2 id={`rol-${rol.id}`}>{rol.nombre}</h2>
              {rol.descripcion && <p>{rol.descripcion}</p>}
              <p className="campo__ayuda">{textoDeAlcance(rol.alcanceTotal)}.</p>
              <PermisosDeRol permisos={rol.permisos} />
            </section>
          ))}
        </div>
      )}
    </>
  )
}
