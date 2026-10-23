import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  listarMonedas,
  obtenerProyeccion,
  type Proyeccion as DatosProyeccion,
} from '../api/ingresos'
import Aviso from '../componentes/Aviso'
import AvisoError from '../componentes/AvisoError'
import Boton from '../componentes/Boton'
import Campo from '../componentes/Campo'
import Cargando from '../componentes/Cargando'
import Seleccion from '../componentes/Seleccion'
import { useDatos } from '../componentes/useDatos'
import { useTitulo } from '../componentes/useTitulo'
import { enMoneda, hoyEnGuatemala, quetzales, soloFecha, tipoDeCambio } from '../formato'
import {
  fechaDeDireccion,
  monedaDeDireccion,
  sinTipoDeCambio,
  textoConvencion,
  validarConsulta,
  type Consulta,
  type ErroresConsulta,
} from './divisas'

const MONEDA_INICIAL = 'USD'

/**
 * Proyección de los ingresos propios a otra moneda (tarjeta 40). La moneda, el período y la fecha del tipo de cambio
 * viven en la dirección (?moneda=EUR&desde=2026-01-01&hasta=2026-06-30&fecha=2026-10-20). La conversión la hace la
 * API (depende de cómo cotiza el Banguat cada moneda); aquí solo se muestra lo que responde, con su fuente.
 */
export default function Proyeccion() {
  useTitulo('Proyección a otra moneda')
  const [params, setParams] = useSearchParams()
  const aplicada: Consulta = {
    moneda: monedaDeDireccion(params.get('moneda')) || MONEDA_INICIAL,
    desde: fechaDeDireccion(params.get('desde')),
    hasta: fechaDeDireccion(params.get('hasta')),
    fecha: fechaDeDireccion(params.get('fecha')),
  }
  const [form, setForm] = useState<Consulta>(aplicada)
  const [errores, setErrores] = useState<ErroresConsulta>({})
  const hoy = hoyEnGuatemala()

  const monedas = useDatos('monedas', (senal) => listarMonedas(senal))
  const erroresAplicada = validarConsulta(aplicada, hoy)
  const aplicadaValida = Object.keys(erroresAplicada).length === 0
  const resultado = useDatos(
    aplicadaValida
      ? `${aplicada.moneda}|${aplicada.desde}|${aplicada.hasta}|${aplicada.fecha}`
      : 'invalida',
    (senal) =>
      aplicadaValida
        ? obtenerProyeccion(
            {
              moneda: aplicada.moneda,
              desde: aplicada.desde || undefined,
              hasta: aplicada.hasta || undefined,
              fecha: aplicada.fecha || undefined,
            },
            senal,
          )
        : Promise.resolve(null),
  )

  function calcular(evento: FormEvent) {
    evento.preventDefault()
    const revision = validarConsulta(form, hoy)
    setErrores(revision)
    if (Object.keys(revision).length > 0) return
    const nuevos = new URLSearchParams()
    nuevos.set('moneda', form.moneda)
    if (form.desde) nuevos.set('desde', form.desde)
    if (form.hasta) nuevos.set('hasta', form.hasta)
    if (form.fecha) nuevos.set('fecha', form.fecha)
    setParams(nuevos)
    resultado.recargar()
  }

  const opcionesMoneda = (monedas.datos ?? []).map((m) => ({
    valor: m.codigo,
    texto: `${m.nombre} (${m.codigo})`,
  }))

  return (
    <>
      <div className="encabezado-pagina encabezado-con-accion">
        <div>
          <h1>Proyección a otra moneda</h1>
          <p>Cuánto suman tus ingresos convertidos con el tipo de cambio del Banco de Guatemala.</p>
        </div>
        <Link className="boton boton--secundario" to="/ingresos">
          Volver a mis ingresos
        </Link>
      </div>

      {monedas.error ? (
        <AvisoError error={monedas.error} titulo="No se pudieron cargar las monedas" />
      ) : (
        <form className="tarjeta filtros" aria-label="Proyección" onSubmit={calcular} noValidate>
          <Seleccion
            etiqueta="Moneda"
            opciones={
              opcionesMoneda.length > 0
                ? opcionesMoneda
                : [{ valor: form.moneda, texto: form.moneda }]
            }
            value={form.moneda}
            onChange={(e) => setForm({ ...form, moneda: e.target.value })}
          />
          <Campo
            etiqueta="Ingresos desde"
            type="date"
            max={hoy}
            error={errores.desde}
            value={form.desde}
            onChange={(e) => setForm({ ...form, desde: e.target.value })}
          />
          <Campo
            etiqueta="Ingresos hasta"
            type="date"
            max={hoy}
            error={errores.hasta}
            value={form.hasta}
            onChange={(e) => setForm({ ...form, hasta: e.target.value })}
          />
          <Campo
            etiqueta="Tipo de cambio del día"
            ayuda="Vacío: el de hoy."
            type="date"
            max={hoy}
            error={errores.fecha}
            value={form.fecha}
            onChange={(e) => setForm({ ...form, fecha: e.target.value })}
          />
          <div className="filtros__acciones">
            <Boton
              type="submit"
              cargando={resultado.cargando && aplicadaValida}
              textoCargando="Calculando..."
            >
              Calcular
            </Boton>
          </div>
        </form>
      )}

      {!aplicadaValida ? (
        <Aviso tipo="advertencia" titulo="Revisa las fechas">
          <p>
            La dirección trae fechas que no se pueden usar. Corrígelas en el formulario y calcula de
            nuevo.
          </p>
        </Aviso>
      ) : (
        <ResultadoProyeccion
          datos={resultado.datos ?? undefined}
          error={resultado.error}
          onReintentar={resultado.recargar}
        />
      )}
    </>
  )
}

interface PropsResultado {
  datos?: DatosProyeccion
  error: unknown
  onReintentar: () => void
}

function ResultadoProyeccion({ datos, error, onReintentar }: PropsResultado) {
  if (error) {
    return (
      <div>
        {sinTipoDeCambio(error) ? (
          <Aviso tipo="error" titulo="No hay tipo de cambio disponible">
            <p>
              El Banco de Guatemala no respondió y todavía no hay un valor guardado para esa fecha.
              Intenta de nuevo más tarde.
            </p>
          </Aviso>
        ) : (
          <AvisoError error={error} titulo="No se pudo calcular la proyección" />
        )}
        <Boton variante="secundario" onClick={onReintentar}>
          Reintentar
        </Boton>
      </div>
    )
  }
  if (!datos) return <Cargando texto="Calculando la proyección..." />

  const periodo =
    datos.desde && datos.hasta
      ? `del ${soloFecha(datos.desde)} al ${soloFecha(datos.hasta)}`
      : datos.desde
        ? `desde el ${soloFecha(datos.desde)}`
        : datos.hasta
          ? `hasta el ${soloFecha(datos.hasta)}`
          : 'de todas las fechas'

  return (
    <section className="tarjeta" aria-labelledby="titulo-proyeccion">
      <h2 id="titulo-proyeccion">
        {quetzales(datos.totalGtq)} equivalen a {enMoneda(datos.totalEnMoneda, datos.moneda)}
      </h2>
      <p>
        Suma de {datos.cantidadIngresos} {datos.cantidadIngresos === 1 ? 'ingreso' : 'ingresos'}{' '}
        {periodo}, convertida a {datos.nombreMoneda}.
      </p>
      {datos.estimado && (
        <Aviso tipo="advertencia" titulo="Tipo de cambio estimado">
          <p>
            El Banco de Guatemala no respondió; se usó el último valor guardado. El resultado puede
            no ser el del día que pediste.
          </p>
        </Aviso>
      )}
      <h3 className="subtitulo">Tipo de cambio usado</h3>
      <dl className="datos">
        <div className="datos__fila">
          <dt>Dólar estadounidense (USD) · {textoConvencion('QUETZALES_POR_DOLAR', 'USD')}</dt>
          <dd>
            {tipoDeCambio(datos.quetzalesPorDolar)} · publicado el {soloFecha(datos.fechaDolar)}
          </dd>
        </div>
        {datos.valorMoneda !== null && (
          <div className="datos__fila">
            <dt>
              {datos.nombreMoneda} ({datos.moneda}) ·{' '}
              {textoConvencion(datos.convencion, datos.moneda)}
            </dt>
            <dd>
              {tipoDeCambio(datos.valorMoneda)}
              {datos.fechaMoneda && ` · publicado el ${soloFecha(datos.fechaMoneda)}`}
            </dd>
          </div>
        )}
        <div className="datos__fila">
          <dt>Fecha pedida</dt>
          <dd>{soloFecha(datos.fechaSolicitada)}</dd>
        </div>
        <div className="datos__fila">
          <dt>Fuente</dt>
          <dd>{datos.fuente}</dd>
        </div>
      </dl>
    </section>
  )
}
