import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listarMonedas, obtenerTipoCambio, type Moneda } from '../api/ingresos'
import Aviso from '../componentes/Aviso'
import AvisoError from '../componentes/AvisoError'
import Boton from '../componentes/Boton'
import Campo from '../componentes/Campo'
import Cargando from '../componentes/Cargando'
import Seleccion from '../componentes/Seleccion'
import { useDatos } from '../componentes/useDatos'
import { useTitulo } from '../componentes/useTitulo'
import { hoyEnGuatemala, soloFecha, tipoDeCambio } from '../formato'
import { fechaDeDireccion, monedaDeDireccion, sinTipoDeCambio, textoConvencion } from './divisas'
import { esFechaValida } from './formulario'

const MONEDA_INICIAL = 'USD'

/**
 * Tipo de cambio de una moneda para un día (tarjeta 40), tal como lo publica el Banco de Guatemala. La moneda y la
 * fecha viven en la dirección (?moneda=EUR&fecha=2026-10-20). Se muestra cómo se cotiza cada moneda, porque no todas
 * se expresan igual frente al dólar.
 */
export default function TipoCambio() {
  useTitulo('Tipo de cambio')
  const [params, setParams] = useSearchParams()
  const moneda = monedaDeDireccion(params.get('moneda')) || MONEDA_INICIAL
  const fecha = fechaDeDireccion(params.get('fecha'))
  const [form, setForm] = useState({ moneda, fecha })
  const [errorFecha, setErrorFecha] = useState<string | undefined>()
  const hoy = hoyEnGuatemala()

  const monedas = useDatos('monedas', (senal) => listarMonedas(senal))
  const fechaUsable = !fecha || fecha <= hoy
  const cambio = useDatos(`${moneda}|${fecha}`, (senal) =>
    fechaUsable ? obtenerTipoCambio(moneda, fecha || undefined, senal) : Promise.resolve(null),
  )

  function consultar(evento: FormEvent) {
    evento.preventDefault()
    if (form.fecha && !esFechaValida(form.fecha)) {
      setErrorFecha('Escribe una fecha válida.')
      return
    }
    if (form.fecha && form.fecha > hoy) {
      setErrorFecha('No puede ser una fecha futura.')
      return
    }
    setErrorFecha(undefined)
    const nuevos = new URLSearchParams()
    nuevos.set('moneda', form.moneda)
    if (form.fecha) nuevos.set('fecha', form.fecha)
    setParams(nuevos)
    cambio.recargar()
  }

  const lista: Moneda[] = monedas.datos ?? []
  const elegida = lista.find((m) => m.codigo === moneda)
  const opciones =
    lista.length > 0
      ? lista.map((m) => ({ valor: m.codigo, texto: `${m.nombre} (${m.codigo})` }))
      : [{ valor: form.moneda, texto: form.moneda }]

  return (
    <>
      <div className="encabezado-pagina">
        <h1>Tipo de cambio</h1>
        <p>Valor de referencia del Banco de Guatemala para cada moneda.</p>
      </div>

      {monedas.error ? (
        <AvisoError error={monedas.error} titulo="No se pudieron cargar las monedas" />
      ) : (
        <form
          className="tarjeta filtros"
          aria-label="Tipo de cambio"
          onSubmit={consultar}
          noValidate
        >
          <Seleccion
            etiqueta="Moneda"
            opciones={opciones}
            value={form.moneda}
            onChange={(e) => setForm({ ...form, moneda: e.target.value })}
          />
          <Campo
            etiqueta="Fecha"
            ayuda="Vacío: hoy."
            type="date"
            max={hoy}
            error={errorFecha}
            value={form.fecha}
            onChange={(e) => setForm({ ...form, fecha: e.target.value })}
          />
          <div className="filtros__acciones">
            <Boton
              type="submit"
              cargando={cambio.cargando && fechaUsable}
              textoCargando="Consultando..."
            >
              Consultar
            </Boton>
          </div>
        </form>
      )}

      {!fechaUsable ? (
        <Aviso tipo="advertencia" titulo="Revisa la fecha">
          <p>No hay tipo de cambio de una fecha futura. Elige hoy o un día anterior.</p>
        </Aviso>
      ) : cambio.error ? (
        <div>
          {sinTipoDeCambio(cambio.error) ? (
            <Aviso tipo="error" titulo="No hay tipo de cambio disponible">
              <p>
                El Banco de Guatemala no respondió y todavía no hay un valor guardado para esa
                fecha. Intenta de nuevo más tarde.
              </p>
            </Aviso>
          ) : (
            <AvisoError error={cambio.error} titulo="No se pudo consultar el tipo de cambio" />
          )}
          <Boton variante="secundario" onClick={cambio.recargar}>
            Reintentar
          </Boton>
        </div>
      ) : !cambio.datos ? (
        <Cargando texto="Consultando el tipo de cambio..." />
      ) : (
        <section className="tarjeta" aria-labelledby="titulo-cambio">
          <h2 id="titulo-cambio">
            {elegida ? `${elegida.nombre} (${cambio.datos.moneda})` : cambio.datos.moneda}:{' '}
            {tipoDeCambio(cambio.datos.valor)}
          </h2>
          <p>{textoConvencion(cambio.datos.convencion, cambio.datos.moneda)}.</p>
          {cambio.datos.estimado && (
            <Aviso tipo="advertencia" titulo="Valor estimado">
              <p>
                El Banco de Guatemala no respondió; este es el último valor guardado y puede no ser
                el del día que pediste.
              </p>
            </Aviso>
          )}
          <dl className="datos">
            <div className="datos__fila">
              <dt>Fecha pedida</dt>
              <dd>{soloFecha(cambio.datos.fechaSolicitada)}</dd>
            </div>
            <div className="datos__fila">
              <dt>Publicado el</dt>
              <dd>{soloFecha(cambio.datos.fecha)}</dd>
            </div>
            <div className="datos__fila">
              <dt>Fuente</dt>
              <dd>{cambio.datos.fuente}</dd>
            </div>
          </dl>
        </section>
      )}
    </>
  )
}
