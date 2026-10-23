import { useState, type FormEvent } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { eliminarIngreso, listarIngresos, type Ingreso } from '../api/ingresos'
import Aviso from '../componentes/Aviso'
import AvisoError from '../componentes/AvisoError'
import Boton from '../componentes/Boton'
import Campo from '../componentes/Campo'
import TablaPaginada, { type Columna } from '../componentes/TablaPaginada'
import { useDatos } from '../componentes/useDatos'
import { useTitulo } from '../componentes/useTitulo'
import { hoyEnGuatemala, quetzales, soloFecha } from '../formato'
import { useSesion } from '../sesion/contexto'
import { fechaDeDireccion } from './divisas'

/**
 * Mis ingresos (tarjeta 40): lista paginada del más reciente al más antiguo, con filtro de fechas en la dirección
 * (?desde=2026-01-01&hasta=2026-06-30&page=1), y las acciones de editar y eliminar. Se entra con ingreso:leer (lo
 * exige la ruta); Nuevo, Editar y Eliminar aparecen solo con su permiso y la API lo vuelve a comprobar. La API solo
 * devuelve los ingresos propios. Eliminar es lógico: el ingreso deja de sumarse pero queda en la base.
 */
export default function ListaIngresos() {
  useTitulo('Mis ingresos')
  const { tienePermiso } = useSesion()
  const ubicacion = useLocation()
  const [params, setParams] = useSearchParams()
  const desde = fechaDeDireccion(params.get('desde'))
  const hasta = fechaDeDireccion(params.get('hasta'))
  const pagina = Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0)

  // Con fechas al revés en la dirección no se pide nada: la API respondería 400 y no hay nada que reintentar
  const direccionInvertida = Boolean(desde && hasta && desde > hasta)
  const ingresos = useDatos(`${desde}|${hasta}|${pagina}`, (senal) =>
    direccionInvertida
      ? Promise.resolve(undefined)
      : listarIngresos(
          { desde: desde || undefined, hasta: hasta || undefined, page: pagina },
          senal,
        ),
  )
  const [trabajando, setTrabajando] = useState(false)
  const [porEliminar, setPorEliminar] = useState<Ingreso | null>(null)
  const [exito, setExito] = useState<string | null>(
    (ubicacion.state as { aviso?: string } | null)?.aviso ?? null,
  )
  const [error, setError] = useState<unknown>(null)

  const puedeEditar = tienePermiso('ingreso:editar')
  const puedeEliminar = tienePermiso('ingreso:eliminar')
  const hoy = hoyEnGuatemala()

  function irAPagina(nueva: number) {
    const nuevos = new URLSearchParams(params)
    if (nueva > 0) nuevos.set('page', String(nueva))
    else nuevos.delete('page')
    setParams(nuevos)
  }

  // Lo escrito en los filtros; se aplica (a la dirección) al presionar Filtrar
  const [filtroDesde, setFiltroDesde] = useState(desde)
  const [filtroHasta, setFiltroHasta] = useState(hasta)
  const fechasInvertidas = Boolean(filtroDesde && filtroHasta && filtroDesde > filtroHasta)

  /** Aplicar los filtros vuelve a la primera página. */
  function aplicar(evento: FormEvent) {
    evento.preventDefault()
    if (fechasInvertidas) return
    const nuevos = new URLSearchParams()
    if (filtroDesde) nuevos.set('desde', filtroDesde)
    if (filtroHasta) nuevos.set('hasta', filtroHasta)
    setParams(nuevos)
  }

  function limpiar() {
    setFiltroDesde('')
    setFiltroHasta('')
    setParams(new URLSearchParams())
  }

  async function eliminar(ingreso: Ingreso) {
    setPorEliminar(null)
    setTrabajando(true)
    setError(null)
    setExito(null)
    try {
      await eliminarIngreso(ingreso.id)
      // Si era lo último de una página que no es la primera, se vuelve a la anterior
      if (ingresos.datos && ingresos.datos.content.length === 1 && pagina > 0) irAPagina(pagina - 1)
      setExito(
        `Eliminamos el ingreso de ${quetzales(ingreso.montoGtq)} del ${soloFecha(ingreso.fecha)}.`,
      )
      ingresos.recargar()
    } catch (fallo) {
      setError(fallo)
    } finally {
      setTrabajando(false)
    }
  }

  const columnas: Columna<Ingreso>[] = [
    { clave: 'fecha', encabezado: 'Fecha', celda: (i) => soloFecha(i.fecha) },
    {
      clave: 'descripcion',
      encabezado: 'Descripción',
      celda: (i) => i.descripcion ?? '—',
    },
    { clave: 'monto', encabezado: 'Monto', derecha: true, celda: (i) => quetzales(i.montoGtq) },
  ]
  if (puedeEditar || puedeEliminar) {
    columnas.push({
      clave: 'acciones',
      encabezado: 'Acciones',
      celda: (i) => (
        <div className="acciones">
          {puedeEditar && (
            <Link
              to={`/ingresos/${i.id}/editar`}
              aria-label={`Editar el ingreso del ${soloFecha(i.fecha)}`}
            >
              Editar
            </Link>
          )}
          {puedeEliminar && (
            <Boton
              variante="peligro"
              disabled={trabajando}
              aria-label={`Eliminar el ingreso del ${soloFecha(i.fecha)}`}
              onClick={() => {
                setExito(null)
                setError(null)
                setPorEliminar(i)
              }}
            >
              Eliminar
            </Boton>
          )}
        </div>
      ),
    })
  }

  const filtrosActivos = Boolean(desde || hasta)
  const consultaProyeccion = new URLSearchParams()
  if (desde) consultaProyeccion.set('desde', desde)
  if (hasta) consultaProyeccion.set('hasta', hasta)
  const textoConsulta = consultaProyeccion.toString()
  const enlaceProyeccion = `/ingresos/proyeccion${textoConsulta ? `?${textoConsulta}` : ''}`

  return (
    <>
      <div className="encabezado-pagina encabezado-con-accion">
        <div>
          <h1>Mis ingresos</h1>
          <p>Registra tus ingresos en quetzales y mira cuánto suman en otra moneda.</p>
        </div>
        <div className="acciones">
          <Link className="boton boton--secundario" to={enlaceProyeccion}>
            Proyectar a otra moneda
          </Link>
          {tienePermiso('ingreso:crear') && (
            <Link className="boton boton--primario" to="/ingresos/nuevo">
              Nuevo ingreso
            </Link>
          )}
        </div>
      </div>

      <form className="tarjeta filtros" aria-label="Filtros" onSubmit={aplicar}>
        <Campo
          etiqueta="Desde"
          type="date"
          max={hoy}
          value={filtroDesde}
          onChange={(e) => setFiltroDesde(e.target.value)}
        />
        <Campo
          etiqueta="Hasta"
          type="date"
          max={hoy}
          value={filtroHasta}
          error={
            fechasInvertidas ? 'La fecha inicial no puede ser posterior a la final.' : undefined
          }
          onChange={(e) => setFiltroHasta(e.target.value)}
        />
        <div className="filtros__acciones">
          <Boton type="submit" disabled={fechasInvertidas}>
            Filtrar
          </Boton>
          <Boton variante="secundario" onClick={limpiar}>
            Limpiar
          </Boton>
        </div>
      </form>

      {exito && <Aviso tipo="exito">{exito}</Aviso>}
      {Boolean(error) && <AvisoError error={error} />}
      {porEliminar && (
        <Aviso
          tipo="advertencia"
          titulo={`¿Eliminar el ingreso de ${quetzales(porEliminar.montoGtq)} del ${soloFecha(porEliminar.fecha)}?`}
        >
          <p>Dejará de aparecer en tu lista y de sumarse en tus proyecciones.</p>
          <div className="acciones-formulario">
            <Boton variante="peligro" onClick={() => void eliminar(porEliminar)}>
              Sí, eliminar
            </Boton>
            <Boton variante="secundario" onClick={() => setPorEliminar(null)}>
              Cancelar
            </Boton>
          </div>
        </Aviso>
      )}

      {direccionInvertida ? (
        <Aviso tipo="advertencia" titulo="Revisa las fechas">
          <p>La fecha inicial es posterior a la final. Corrígelas y presiona Filtrar.</p>
        </Aviso>
      ) : (
        <TablaPaginada<Ingreso>
          titulo="Mis ingresos"
          columnas={columnas}
          pagina={ingresos.datos}
          cargando={ingresos.cargando}
          error={ingresos.error}
          onReintentar={ingresos.recargar}
          onCambiarPagina={irAPagina}
          idFila={(i) => i.id}
          mensajeVacio={
            filtrosActivos
              ? 'No tienes ingresos en esas fechas.'
              : 'Todavía no registraste ingresos. Agrega el primero con «Nuevo ingreso».'
          }
        />
      )}
    </>
  )
}
