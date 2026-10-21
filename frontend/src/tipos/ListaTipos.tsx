import { useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { actualizarTipo, eliminarTipo, listarTiposAdmin, type TipoTramite } from '../api/tramites'
import Aviso from '../componentes/Aviso'
import AvisoError from '../componentes/AvisoError'
import Boton from '../componentes/Boton'
import Insignia from '../componentes/Insignia'
import Seleccion from '../componentes/Seleccion'
import TablaPaginada, { type Columna } from '../componentes/TablaPaginada'
import { useDatos } from '../componentes/useDatos'
import { useTitulo } from '../componentes/useTitulo'
import { quetzales } from '../formato'
import { useSesion } from '../sesion/contexto'

const FILTROS_ACTIVO = [
  { valor: 'true', texto: 'Activos' },
  { valor: 'false', texto: 'Inactivos' },
]

/**
 * Administración de los tipos de trámite: lista paginada con filtro por estado (en la dirección: ?activo=false&page=1),
 * y las acciones de editar, activar o desactivar y eliminar. Se entra con tipo_tramite:editar (lo exige la ruta), así que
 * Editar y Activar/Desactivar siempre están; Eliminar aparece solo con tipo_tramite:eliminar (la API lo vuelve a comprobar). Eliminar es lógico: el tipo desaparece de las listas pero queda en la base.
 */
export default function ListaTipos() {
  useTitulo('Tipos de trámite')
  const { tienePermiso } = useSesion()
  const ubicacion = useLocation()
  const [params, setParams] = useSearchParams()
  const filtroActivo =
    params.get('activo') === 'true' || params.get('activo') === 'false' ? params.get('activo')! : ''
  const pagina = Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0)

  const tipos = useDatos(`${filtroActivo}|${pagina}`, (senal) =>
    listarTiposAdmin(
      { activo: filtroActivo ? filtroActivo === 'true' : undefined, page: pagina },
      senal,
    ),
  )
  const [trabajando, setTrabajando] = useState<number | null>(null)
  const [porEliminar, setPorEliminar] = useState<TipoTramite | null>(null)
  const [exito, setExito] = useState<string | null>(
    (ubicacion.state as { aviso?: string } | null)?.aviso ?? null,
  )
  const [error, setError] = useState<unknown>(null)

  const puedeEliminar = tienePermiso('tipo_tramite:eliminar')

  function irAPagina(nueva: number) {
    const nuevos = new URLSearchParams(params)
    if (nueva > 0) nuevos.set('page', String(nueva))
    else nuevos.delete('page')
    setParams(nuevos)
  }

  function filtrar(valor: string) {
    const nuevos = new URLSearchParams()
    if (valor) nuevos.set('activo', valor)
    setParams(nuevos)
  }

  async function ejecutar(tipo: TipoTramite, accion: () => Promise<string>) {
    setTrabajando(tipo.id)
    setError(null)
    setExito(null)
    try {
      setExito(await accion())
      tipos.recargar()
    } catch (fallo) {
      setError(fallo)
    } finally {
      setTrabajando(null)
    }
  }

  function cambiarEstado(tipo: TipoTramite) {
    // Se manda sin "campos": la API deja los que el tipo ya tiene
    void ejecutar(tipo, async () => {
      await actualizarTipo(tipo.id, {
        nombre: tipo.nombre,
        descripcion: tipo.descripcion,
        monto: tipo.monto,
        activo: !tipo.activo,
      })
      return tipo.activo ? `Desactivamos «${tipo.nombre}».` : `Activamos «${tipo.nombre}».`
    })
  }

  function eliminar(tipo: TipoTramite) {
    setPorEliminar(null)
    void ejecutar(tipo, async () => {
      await eliminarTipo(tipo.id)
      // Si era lo último de una página que no es la primera, se vuelve a la anterior
      if (tipos.datos && tipos.datos.content.length === 1 && pagina > 0) irAPagina(pagina - 1)
      return `Eliminamos «${tipo.nombre}».`
    })
  }

  const columnas: Columna<TipoTramite>[] = [
    { clave: 'nombre', encabezado: 'Nombre', celda: (t) => t.nombre },
    { clave: 'monto', encabezado: 'Monto', derecha: true, celda: (t) => quetzales(t.monto) },
    { clave: 'campos', encabezado: 'Campos', derecha: true, celda: (t) => t.campos.length },
    {
      clave: 'estado',
      encabezado: 'Estado',
      celda: (t) => (
        <Insignia tono={t.activo ? 'exito' : 'neutra'}>{t.activo ? 'Activo' : 'Inactivo'}</Insignia>
      ),
    },
    {
      clave: 'acciones',
      encabezado: 'Acciones',
      celda: (t) => (
        <div className="acciones">
          <Link to={`/tipos/${t.id}/editar`} aria-label={`Editar ${t.nombre}`}>
            Editar
          </Link>
          <Boton
            variante="secundario"
            disabled={trabajando !== null}
            aria-label={`${t.activo ? 'Desactivar' : 'Activar'} ${t.nombre}`}
            onClick={() => cambiarEstado(t)}
          >
            {t.activo ? 'Desactivar' : 'Activar'}
          </Boton>
          {puedeEliminar && (
            <Boton
              variante="peligro"
              disabled={trabajando !== null}
              aria-label={`Eliminar ${t.nombre}`}
              onClick={() => {
                setExito(null)
                setError(null)
                setPorEliminar(t)
              }}
            >
              Eliminar
            </Boton>
          )}
        </div>
      ),
    },
  ]

  return (
    <>
      <div className="encabezado-pagina encabezado-con-accion">
        <div>
          <h1>Tipos de trámite</h1>
          <p>Define qué trámites existen, cuánto cuestan y qué datos se piden.</p>
        </div>
        {tienePermiso('tipo_tramite:crear') && (
          <Link className="boton boton--primario" to="/tipos/nuevo">
            Nuevo tipo
          </Link>
        )}
      </div>

      <form className="tarjeta filtros" aria-label="Filtros" onSubmit={(e) => e.preventDefault()}>
        <Seleccion
          etiqueta="Estado"
          opcionVacia="Todos"
          opciones={FILTROS_ACTIVO}
          value={filtroActivo}
          onChange={(e) => filtrar(e.target.value)}
        />
      </form>

      {exito && <Aviso tipo="exito">{exito}</Aviso>}
      {Boolean(error) && <AvisoError error={error} />}
      {porEliminar && (
        <Aviso tipo="advertencia" titulo={`¿Eliminar «${porEliminar.nombre}»?`}>
          <p>
            Dejará de aparecer en las listas y nadie podrá iniciar este trámite. Los trámites que ya
            existen conservan sus datos.
          </p>
          <div className="acciones-formulario">
            <Boton variante="peligro" onClick={() => eliminar(porEliminar)}>
              Sí, eliminar
            </Boton>
            <Boton variante="secundario" onClick={() => setPorEliminar(null)}>
              Cancelar
            </Boton>
          </div>
        </Aviso>
      )}

      <TablaPaginada<TipoTramite>
        titulo="Tipos de trámite"
        columnas={columnas}
        pagina={tipos.datos}
        cargando={tipos.cargando}
        error={tipos.error}
        onReintentar={tipos.recargar}
        onCambiarPagina={irAPagina}
        idFila={(t) => t.id}
        mensajeVacio={
          filtroActivo
            ? 'No hay tipos de trámite con ese estado.'
            : 'Todavía no hay tipos de trámite. Crea el primero con «Nuevo tipo».'
        }
      />
    </>
  )
}
