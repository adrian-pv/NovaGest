import { useState, type FormEvent } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import {
  actualizarUsuario,
  desbloquearUsuario,
  listarRoles,
  listarUsuarios,
  type UsuarioAdmin,
} from '../api/usuarios'
import Aviso from '../componentes/Aviso'
import AvisoError from '../componentes/AvisoError'
import Boton from '../componentes/Boton'
import Campo from '../componentes/Campo'
import Insignia from '../componentes/Insignia'
import Seleccion from '../componentes/Seleccion'
import TablaPaginada, { type Columna } from '../componentes/TablaPaginada'
import { useDatos } from '../componentes/useDatos'
import { useTitulo } from '../componentes/useTitulo'
import { useSesion } from '../sesion/contexto'

const FILTROS_ACTIVO = [
  { valor: 'true', texto: 'Activos' },
  { valor: 'false', texto: 'Inactivos' },
]

/**
 * Administración de usuarios: lista paginada con búsqueda por nombre o correo y filtros por rol y estado (todo en la
 * dirección: ?buscar=ana&rol=GESTOR&activo=true&page=1). Quien solo puede consultar (usuario:leer) ve la lista sin
 * acciones; con usuario:editar aparecen Editar, Activar/Desactivar y Desbloquear, y con usuario:crear, "Nuevo usuario".
 * Nadie puede desactivar su propia cuenta (la API lo rechaza): ese botón sale desactivado en la fila propia.
 */
export default function ListaUsuarios() {
  useTitulo('Usuarios')
  const { perfil, tienePermiso } = useSesion()
  const ubicacion = useLocation()
  const [params, setParams] = useSearchParams()
  const filtro = {
    buscar: params.get('buscar') ?? '',
    rol: params.get('rol') ?? '',
    activo:
      params.get('activo') === 'true' || params.get('activo') === 'false'
        ? params.get('activo')!
        : '',
    page: Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0),
  }
  const hayFiltros = Boolean(filtro.buscar || filtro.rol || filtro.activo)

  const usuarios = useDatos(JSON.stringify(filtro), (senal) =>
    listarUsuarios(
      {
        buscar: filtro.buscar || undefined,
        rol: filtro.rol || undefined,
        activo: filtro.activo ? filtro.activo === 'true' : undefined,
        page: filtro.page,
      },
      senal,
    ),
  )
  // Sin rol:leer (por ejemplo, el gestor) la API rechaza esta carga: la lista funciona igual, solo sin filtro por rol
  const roles = useDatos('roles', (senal) => listarRoles(senal))

  const [buscar, setBuscar] = useState(filtro.buscar)
  const [rol, setRol] = useState(filtro.rol)
  const [activo, setActivo] = useState(filtro.activo)
  const [trabajando, setTrabajando] = useState<number | null>(null)
  const [exito, setExito] = useState<string | null>(
    (ubicacion.state as { aviso?: string } | null)?.aviso ?? null,
  )
  const [error, setError] = useState<unknown>(null)

  const puedeEditar = tienePermiso('usuario:editar')

  function aplicar(evento: FormEvent) {
    evento.preventDefault()
    const nuevos = new URLSearchParams()
    if (buscar.trim()) nuevos.set('buscar', buscar.trim())
    if (rol) nuevos.set('rol', rol)
    if (activo) nuevos.set('activo', activo)
    setParams(nuevos)
  }

  function limpiar() {
    setBuscar('')
    setRol('')
    setActivo('')
    setParams(new URLSearchParams())
  }

  function irAPagina(pagina: number) {
    const nuevos = new URLSearchParams(params)
    if (pagina > 0) nuevos.set('page', String(pagina))
    else nuevos.delete('page')
    setParams(nuevos)
  }

  async function ejecutar(usuario: UsuarioAdmin, accion: () => Promise<string>) {
    setTrabajando(usuario.id)
    setError(null)
    setExito(null)
    try {
      setExito(await accion())
      usuarios.recargar()
    } catch (fallo) {
      setError(fallo)
    } finally {
      setTrabajando(null)
    }
  }

  function cambiarEstado(usuario: UsuarioAdmin) {
    void ejecutar(usuario, async () => {
      await actualizarUsuario(usuario.id, {
        nombre: usuario.nombre,
        activo: !usuario.activo,
        roles: usuario.roles,
      })
      return usuario.activo
        ? `Desactivamos la cuenta de ${usuario.nombre}.`
        : `Activamos la cuenta de ${usuario.nombre}.`
    })
  }

  function desbloquear(usuario: UsuarioAdmin) {
    void ejecutar(usuario, async () => {
      await desbloquearUsuario(usuario.id)
      return `Desbloqueamos la cuenta de ${usuario.nombre}.`
    })
  }

  const columnas: Columna<UsuarioAdmin>[] = [
    {
      clave: 'nombre',
      encabezado: 'Nombre',
      celda: (u) => (u.id === perfil?.id ? `${u.nombre} (tú)` : u.nombre),
    },
    { clave: 'correo', encabezado: 'Correo', celda: (u) => u.correo },
    {
      clave: 'roles',
      encabezado: 'Roles',
      celda: (u) => (
        <span className="insignias">
          {u.roles.map((r) => (
            <Insignia key={r} tono="info">
              {r}
            </Insignia>
          ))}
        </span>
      ),
    },
    {
      clave: 'estado',
      encabezado: 'Estado',
      celda: (u) => (
        <span className="insignias">
          <Insignia tono={u.activo ? 'exito' : 'neutra'}>
            {u.activo ? 'Activa' : 'Inactiva'}
          </Insignia>
          {u.bloqueado && <Insignia tono="advertencia">Bloqueada</Insignia>}
        </span>
      ),
    },
  ]
  if (puedeEditar) {
    columnas.push({
      clave: 'acciones',
      encabezado: 'Acciones',
      celda: (u) => (
        <div className="acciones">
          <Link to={`/usuarios/${u.id}/editar`} aria-label={`Editar a ${u.nombre}`}>
            Editar
          </Link>
          <Boton
            variante="secundario"
            disabled={trabajando !== null || (u.activo && u.id === perfil?.id)}
            aria-label={`${u.activo ? 'Desactivar' : 'Activar'} a ${u.nombre}`}
            onClick={() => cambiarEstado(u)}
          >
            {u.activo ? 'Desactivar' : 'Activar'}
          </Boton>
          {u.bloqueado && (
            <Boton
              variante="secundario"
              disabled={trabajando !== null}
              aria-label={`Desbloquear a ${u.nombre}`}
              onClick={() => desbloquear(u)}
            >
              Desbloquear
            </Boton>
          )}
        </div>
      ),
    })
  }

  return (
    <>
      <div className="encabezado-pagina encabezado-con-accion">
        <div>
          <h1>Usuarios</h1>
          <p>
            Quién tiene cuenta y qué puede hacer.{' '}
            {tienePermiso('rol:leer') && <Link to="/roles">Ver qué permite cada rol</Link>}
          </p>
        </div>
        {tienePermiso('usuario:crear') && (
          <Link className="boton boton--primario" to="/usuarios/nuevo">
            Nuevo usuario
          </Link>
        )}
      </div>

      <form className="tarjeta filtros" onSubmit={aplicar} aria-label="Filtros">
        <Campo
          etiqueta="Buscar por nombre o correo"
          value={buscar}
          maxLength={100}
          onChange={(e) => setBuscar(e.target.value)}
        />
        {roles.datos && (
          <Seleccion
            etiqueta="Rol"
            opcionVacia="Todos"
            opciones={roles.datos.map((r) => ({ valor: r.nombre, texto: r.nombre }))}
            value={rol}
            onChange={(e) => setRol(e.target.value)}
          />
        )}
        <Seleccion
          etiqueta="Estado"
          opcionVacia="Todos"
          opciones={FILTROS_ACTIVO}
          value={activo}
          onChange={(e) => setActivo(e.target.value)}
        />
        <div className="filtros__acciones">
          <Boton type="submit">Filtrar</Boton>
          <Boton variante="secundario" onClick={limpiar}>
            Limpiar
          </Boton>
        </div>
      </form>

      {exito && <Aviso tipo="exito">{exito}</Aviso>}
      {Boolean(error) && <AvisoError error={error} />}

      <TablaPaginada<UsuarioAdmin>
        titulo="Usuarios"
        columnas={columnas}
        pagina={usuarios.datos}
        cargando={usuarios.cargando}
        error={usuarios.error}
        onReintentar={usuarios.recargar}
        onCambiarPagina={irAPagina}
        idFila={(u) => u.id}
        mensajeVacio={
          hayFiltros ? 'No hay usuarios que coincidan con los filtros.' : 'Todavía no hay usuarios.'
        }
      />
    </>
  )
}
