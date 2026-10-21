import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ESTADOS, listarTipos, listarTramites, type Tramite } from '../api/tramites'
import Aviso from '../componentes/Aviso'
import Boton from '../componentes/Boton'
import Campo from '../componentes/Campo'
import Seleccion from '../componentes/Seleccion'
import TablaPaginada, { type Columna } from '../componentes/TablaPaginada'
import { useDatos } from '../componentes/useDatos'
import { useTitulo } from '../componentes/useTitulo'
import { fechaHora } from '../formato'
import { useSesion } from '../sesion/contexto'
import { ETIQUETA_ESTADO } from './etiquetas'
import EstadoInsignia from './EstadoInsignia'

const COLUMNAS: Columna<Tramite>[] = [
  { clave: 'id', encabezado: 'N.º', celda: (t) => `#${t.id}` },
  { clave: 'tipo', encabezado: 'Trámite', celda: (t) => t.tipoNombre },
  { clave: 'estado', encabezado: 'Estado', celda: (t) => <EstadoInsignia estado={t.estado} /> },
  { clave: 'creado', encabezado: 'Creado', celda: (t) => fechaHora(t.creadoEn) },
  {
    clave: 'ver',
    encabezado: 'Detalle',
    celda: (t) => (
      <Link to={`/tramites/${t.id}`} aria-label={`Ver el trámite ${t.id}`}>
        Ver
      </Link>
    ),
  },
]

/**
 * Listado de trámites con filtros por estado, tipo y fechas. Los filtros y la página viven en la dirección
 * (?estado=ENVIADO&page=1), así que "atrás" y compartir el enlace funcionan. La API decide cuáles se ven: una
 * persona ciudadana recibe solo los suyos y el personal con alcance total recibe todos.
 */
export default function ListaTramites() {
  const { perfil, tienePermiso } = useSesion()
  const [params, setParams] = useSearchParams()
  const alcanceTotal = perfil?.alcanceTotal ?? false
  useTitulo(alcanceTotal ? 'Trámites' : 'Mis trámites')

  const filtro = {
    estado: params.get('estado') ?? '',
    tipoId: params.get('tipoId') ?? '',
    desde: params.get('desde') ?? '',
    hasta: params.get('hasta') ?? '',
    page: Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0),
  }
  const hayFiltros = Boolean(filtro.estado || filtro.tipoId || filtro.desde || filtro.hasta)

  const tramites = useDatos(JSON.stringify(filtro), (senal) =>
    listarTramites(
      {
        estado: filtro.estado || undefined,
        tipoId: filtro.tipoId || undefined,
        desde: filtro.desde || undefined,
        hasta: filtro.hasta || undefined,
        page: filtro.page,
      },
      senal,
    ),
  )
  const tipos = useDatos('tipos', (senal) => listarTipos(senal))

  const [estado, setEstado] = useState(filtro.estado)
  const [tipoId, setTipoId] = useState(filtro.tipoId)
  const [desde, setDesde] = useState(filtro.desde)
  const [hasta, setHasta] = useState(filtro.hasta)
  const fechasInvertidas = Boolean(desde && hasta && desde > hasta)

  function aplicar(evento: FormEvent) {
    evento.preventDefault()
    if (fechasInvertidas) return
    const nuevos = new URLSearchParams()
    if (estado) nuevos.set('estado', estado)
    if (tipoId) nuevos.set('tipoId', tipoId)
    if (desde) nuevos.set('desde', desde)
    if (hasta) nuevos.set('hasta', hasta)
    setParams(nuevos)
  }

  function limpiar() {
    setEstado('')
    setTipoId('')
    setDesde('')
    setHasta('')
    setParams(new URLSearchParams())
  }

  function irAPagina(pagina: number) {
    const nuevos = new URLSearchParams(params)
    if (pagina > 0) nuevos.set('page', String(pagina))
    else nuevos.delete('page')
    setParams(nuevos)
  }

  const mensajeVacio = hayFiltros
    ? 'No hay trámites que coincidan con los filtros.'
    : alcanceTotal
      ? 'Todavía no hay trámites registrados.'
      : 'Todavía no tienes trámites. Crea el primero con "Nuevo trámite".'

  return (
    <>
      <div className="encabezado-pagina encabezado-con-accion">
        <div>
          <h1>{alcanceTotal ? 'Trámites' : 'Mis trámites'}</h1>
          <p>
            {alcanceTotal
              ? 'Todos los trámites del sistema.'
              : 'Consulta el estado de tus trámites y crea nuevos.'}
          </p>
        </div>
        {tienePermiso('tramite:crear') && (
          <Link className="boton boton--primario" to="/tramites/nuevo">
            Nuevo trámite
          </Link>
        )}
      </div>

      <form className="tarjeta filtros" onSubmit={aplicar} aria-label="Filtros">
        <Seleccion
          etiqueta="Estado"
          opcionVacia="Todos"
          opciones={ESTADOS.map((e) => ({ valor: e, texto: ETIQUETA_ESTADO[e] }))}
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
        />
        <Seleccion
          etiqueta="Tipo de trámite"
          opcionVacia="Todos"
          opciones={(tipos.datos?.content ?? []).map((t) => ({
            valor: String(t.id),
            texto: t.nombre,
          }))}
          value={tipoId}
          onChange={(e) => setTipoId(e.target.value)}
        />
        <Campo
          etiqueta="Creado desde"
          type="date"
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
        />
        <Campo
          etiqueta="Creado hasta"
          type="date"
          value={hasta}
          error={
            fechasInvertidas ? 'La fecha inicial no puede ser posterior a la final.' : undefined
          }
          onChange={(e) => setHasta(e.target.value)}
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

      {hayFiltros && tramites.datos && (
        <Aviso tipo="info">
          Mostrando {tramites.datos.page.totalElements} resultado
          {tramites.datos.page.totalElements === 1 ? '' : 's'} con los filtros aplicados.
        </Aviso>
      )}
      <TablaPaginada<Tramite>
        titulo="Lista de trámites"
        columnas={COLUMNAS}
        pagina={tramites.datos}
        cargando={tramites.cargando}
        error={tramites.error}
        onReintentar={tramites.recargar}
        onCambiarPagina={irAPagina}
        idFila={(t) => t.id}
        mensajeVacio={mensajeVacio}
      />
    </>
  )
}
