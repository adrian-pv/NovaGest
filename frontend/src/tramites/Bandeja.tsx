import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { listarTramites, type EstadoTramite, type Tramite } from '../api/tramites'
import TablaPaginada, { type Columna } from '../componentes/TablaPaginada'
import { useDatos } from '../componentes/useDatos'
import { useTitulo } from '../componentes/useTitulo'
import { fechaHora } from '../formato'
import { useSesion } from '../sesion/contexto'
import EstadoInsignia from './EstadoInsignia'

interface Cola {
  clave: string
  etiqueta: string
  estados: EstadoTramite[]
  ayuda: string
}

/** Las colas de trabajo del personal. "Observados" no es de atención del gestor: espera a la persona. */
const COLAS: Cola[] = [
  {
    clave: 'por-tomar',
    etiqueta: 'Por tomar',
    estados: ['ENVIADO'],
    ayuda: 'Enviados que nadie ha tomado todavía.',
  },
  {
    clave: 'en-revision',
    etiqueta: 'En revisión',
    estados: ['EN_REVISION'],
    ayuda: 'Trámites que ya están siendo revisados.',
  },
  {
    clave: 'por-pagar',
    etiqueta: 'Esperando pago',
    estados: ['POR_PAGAR'],
    ayuda: 'Aprobados que esperan el comprobante de pago o su validación.',
  },
  {
    clave: 'observados',
    etiqueta: 'Observados',
    estados: ['OBSERVADO'],
    ayuda: 'Esperan que la persona corrija lo que se le indicó.',
  },
]

const PENDIENTES: Cola = {
  clave: 'todos',
  etiqueta: 'Pendientes de atención',
  estados: ['ENVIADO', 'EN_REVISION', 'POR_PAGAR'],
  ayuda: 'Todo lo que espera una acción del personal.',
}

const TODAS_LAS_COLAS = [PENDIENTES, ...COLAS]

type Cuentas = Record<string, number>

/**
 * Bandeja de trabajo del personal: los trámites que esperan atención, por cola, con los más antiguos primero para
 * que nada se quede esperando. Cada trámite se abre en la misma pantalla de detalle de todos, donde la API decide
 * qué acciones se pueden hacer. La cola y la página viven en la dirección (/bandeja?cola=por-tomar&page=1).
 */
export default function Bandeja() {
  useTitulo('Bandeja')
  const { perfil } = useSesion()
  const ubicacion = useLocation()
  const [params, setParams] = useSearchParams()

  const cola = TODAS_LAS_COLAS.find((c) => c.clave === params.get('cola')) ?? PENDIENTES
  const pagina = Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0)

  const lista = useDatos(`${cola.clave}|${pagina}`, (senal) =>
    listarTramites({ estado: cola.estados.join(','), page: pagina, sort: 'creadoEn,asc' }, senal),
  )

  // Una consulta de tamaño 1 por cola basta para saber cuántos hay (el total viene en `page`)
  const cuentas = useDatos('cuentas', async (senal): Promise<Cuentas> => {
    const respuestas = await Promise.all(
      COLAS.map((c) => listarTramites({ estado: c.estados.join(','), size: 1 }, senal)),
    )
    const cuentas: Cuentas = {}
    COLAS.forEach((c, i) => {
      cuentas[c.clave] = respuestas[i].page.totalElements
    })
    // "Pendientes" es la suma de las colas cuyo estado espera una acción del personal
    cuentas[PENDIENTES.clave] = COLAS.filter((c) =>
      PENDIENTES.estados.includes(c.estados[0]),
    ).reduce((suma, c) => suma + cuentas[c.clave], 0)
    return cuentas
  })

  const desde = ubicacion.pathname + ubicacion.search
  const columnas: Columna<Tramite>[] = [
    { clave: 'id', encabezado: 'N.º', celda: (t) => `#${t.id}` },
    { clave: 'tipo', encabezado: 'Trámite', celda: (t) => t.tipoNombre },
    { clave: 'estado', encabezado: 'Estado', celda: (t) => <EstadoInsignia estado={t.estado} /> },
    { clave: 'recibido', encabezado: 'Recibido', celda: (t) => fechaHora(t.creadoEn) },
    {
      clave: 'gestor',
      encabezado: 'Gestor',
      celda: (t) =>
        t.gestorId === null
          ? 'Sin asignar'
          : t.gestorId === perfil?.id
            ? 'Tú'
            : `Usuario #${t.gestorId}`,
    },
    {
      clave: 'abrir',
      encabezado: 'Detalle',
      celda: (t) => (
        <Link to={`/tramites/${t.id}`} state={{ desde }} aria-label={`Abrir el trámite ${t.id}`}>
          Abrir
        </Link>
      ),
    },
  ]

  function irAPagina(numero: number) {
    const nuevos = new URLSearchParams(params)
    if (numero > 0) nuevos.set('page', String(numero))
    else nuevos.delete('page')
    setParams(nuevos)
  }

  return (
    <>
      <div className="encabezado-pagina">
        <h1>Bandeja</h1>
        <p>{cola.ayuda} Los más antiguos primero.</p>
      </div>

      <nav aria-label="Colas de trabajo">
        <ul className="colas">
          {TODAS_LAS_COLAS.map((c) => {
            const activa = c.clave === cola.clave
            const cuenta = cuentas.datos?.[c.clave]
            return (
              <li key={c.clave}>
                <Link
                  to={c.clave === PENDIENTES.clave ? '/bandeja' : `/bandeja?cola=${c.clave}`}
                  className={activa ? 'colas__enlace colas__enlace--activa' : 'colas__enlace'}
                  aria-current={activa ? 'page' : undefined}
                >
                  {c.etiqueta}
                  {cuenta !== undefined && <span className="colas__cuenta">{cuenta}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <TablaPaginada<Tramite>
        titulo={`Trámites: ${cola.etiqueta}`}
        columnas={columnas}
        pagina={lista.datos}
        cargando={lista.cargando}
        error={lista.error}
        onReintentar={lista.recargar}
        onCambiarPagina={irAPagina}
        idFila={(t) => t.id}
        mensajeVacio={
          cola.clave === PENDIENTES.clave
            ? 'Bandeja al día: no hay trámites pendientes de atención.'
            : `No hay trámites en "${cola.etiqueta}".`
        }
      />
    </>
  )
}
