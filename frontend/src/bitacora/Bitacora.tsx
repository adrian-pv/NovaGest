import { Link, useSearchParams } from 'react-router-dom'
import { consultarBitacora, type RegistroBitacora } from '../api/bitacora'
import type { Pagina } from '../api/tipos'
import Aviso from '../componentes/Aviso'
import TablaPaginada, { type Columna } from '../componentes/TablaPaginada'
import { useDatos } from '../componentes/useDatos'
import { useTitulo } from '../componentes/useTitulo'
import { fechaHora } from '../formato'
import DetalleRegistro from './DetalleRegistro'
import FormularioFiltros from './FormularioFiltros'
import { etiquetaDeAccion, etiquetaDeRecurso } from './etiquetas'
import {
  SIN_FILTROS,
  aConsulta,
  aParametros,
  desdeParametros,
  hayFiltros,
  validar,
} from './filtros'

const SIN_DATOS: Pagina<RegistroBitacora> = {
  content: [],
  page: { size: 20, number: 0, totalElements: 0, totalPages: 0 },
}

const columnas: Columna<RegistroBitacora>[] = [
  { clave: 'fecha', encabezado: 'Fecha', celda: (r) => fechaHora(r.fecha) },
  {
    clave: 'persona',
    encabezado: 'Persona',
    celda: (r) =>
      r.actorId === null ? (
        'Sistema'
      ) : (
        <Link
          to={{ search: aParametros({ ...SIN_FILTROS, actorId: String(r.actorId) }).toString() }}
          aria-label={`Ver las acciones del usuario ${r.actorId}`}
        >
          #{r.actorId}
          {r.actorCorreo ? ` · ${r.actorCorreo}` : ''}
        </Link>
      ),
  },
  {
    clave: 'accion',
    encabezado: 'Acción',
    celda: (r) => <span title={r.accion}>{etiquetaDeAccion(r.accion)}</span>,
  },
  {
    clave: 'recurso',
    encabezado: 'Recurso',
    celda: (r) =>
      `${etiquetaDeRecurso(r.recurso)}${r.recursoId === null ? '' : ` #${r.recursoId}`}`,
  },
  { clave: 'ip', encabezado: 'IP', celda: (r) => r.ip ?? '—' },
  { clave: 'detalle', encabezado: 'Detalle', celda: (r) => <DetalleRegistro registro={r} /> },
]

/**
 * Consulta de la bitácora de auditoría (bitacora:leer): del registro más reciente al más antiguo, con filtros por
 * recurso, acción, usuario, registro afectado y fechas. Los filtros y la página viven en la dirección
 * (?recurso=pago&accion=VALIDACION_PAGO&desde=2026-10-01&page=1), así que se puede compartir el enlace. Solo lectura. Con
 * un filtro inválido en la dirección no se consulta: se muestra el error en vez de datos sin filtrar.
 */
export default function Bitacora() {
  useTitulo('Bitácora')
  const [params, setParams] = useSearchParams()
  const filtros = desdeParametros(params)
  const errores = validar(filtros)
  const invalido = Object.keys(errores).length > 0
  const page = Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0)

  const registros = useDatos(`${invalido}|${JSON.stringify(filtros)}|${page}`, (senal) =>
    invalido ? Promise.resolve(SIN_DATOS) : consultarBitacora(aConsulta(filtros, page), senal),
  )

  function irAPagina(nueva: number) {
    const nuevos = new URLSearchParams(params)
    if (nueva > 0) nuevos.set('page', String(nueva))
    else nuevos.delete('page')
    setParams(nuevos)
  }

  return (
    <>
      <div className="encabezado-pagina">
        <h1>Bitácora</h1>
        <p>Registro de las acciones del sistema, del más reciente al más antiguo.</p>
      </div>
      <Aviso tipo="info">
        <p>
          Esta consulta es solo de lectura y <strong>queda registrada</strong> en la bitácora
          (acción «Consulta de la bitácora»), igual que cada cambio de página o de filtro.
        </p>
      </Aviso>

      <FormularioFiltros
        key={JSON.stringify(filtros)}
        inicial={filtros}
        erroresDeLaDireccion={errores}
        onAplicar={(nuevos) => setParams(aParametros(nuevos))}
      />

      {invalido ? (
        <Aviso tipo="advertencia" titulo="Corrige los filtros">
          <p>
            La dirección trae filtros que no son válidos. No se consultó la bitácora para no mostrar
            datos sin filtrar.
          </p>
        </Aviso>
      ) : (
        <>
          {hayFiltros(filtros) && registros.datos && (
            <Aviso tipo="info">
              Mostrando {registros.datos.page.totalElements} registro
              {registros.datos.page.totalElements === 1 ? '' : 's'} con los filtros aplicados.
            </Aviso>
          )}
          <TablaPaginada<RegistroBitacora>
            titulo="Registros de la bitácora"
            columnas={columnas}
            pagina={registros.datos}
            cargando={registros.cargando}
            error={registros.error}
            onReintentar={registros.recargar}
            onCambiarPagina={irAPagina}
            idFila={(r) => r.id}
            mensajeVacio={
              hayFiltros(filtros)
                ? 'No hay registros con esos filtros.'
                : 'La bitácora todavía no tiene registros.'
            }
          />
        </>
      )}
    </>
  )
}
