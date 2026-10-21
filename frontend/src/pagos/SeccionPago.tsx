import { useId, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  descargarComprobante,
  listarPagosDeTramite,
  subirComprobante,
  type Pago,
} from '../api/pagos'
import type { TipoTramite, Tramite } from '../api/tramites'
import Aviso from '../componentes/Aviso'
import AvisoError from '../componentes/AvisoError'
import Boton from '../componentes/Boton'
import Cargando from '../componentes/Cargando'
import Insignia from '../componentes/Insignia'
import { useDatos } from '../componentes/useDatos'
import { guardarArchivo } from '../descarga'
import { fechaHora, quetzales } from '../formato'
import { motivoDeCampo } from '../paginas/formularios'
import { useSesion } from '../sesion/contexto'
import { ACEPTADOS, motivoDeRechazo, tamanoLegible } from './comprobante'
import { ETIQUETA_PAGO, nombreDeTipo, TONO_PAGO } from './etiquetas'

interface Props {
  tramite: Tramite
  tipo: TipoTramite
}

/**
 * Pago de un trámite: el monto, los comprobantes enviados con su estado y, cuando corresponde, el formulario para
 * subir uno nuevo. Solo existe a partir de "Por pagar", así que en otros estados no se muestra ni se consulta.
 *
 * Validar o rechazar un comprobante (la parte del gestor) es la tarjeta 36: se agrega aquí, en la lista de pagos,
 * para los pagos PENDIENTES de quien tenga el permiso pago:editar.
 */
export default function SeccionPago({ tramite, tipo }: Props) {
  const { tienePermiso } = useSesion()
  const aplica = tramite.estado === 'POR_PAGAR' || tramite.estado === 'FINALIZADO'
  if (!aplica || !tienePermiso('pago:leer')) return null
  return <Pagos tramite={tramite} tipo={tipo} />
}

function Pagos({ tramite, tipo }: Props) {
  const { tienePermiso } = useSesion()
  const pagos = useDatos(`pagos-${tramite.id}`, (senal) => listarPagosDeTramite(tramite.id, senal))
  const lista = pagos.datos?.content ?? []
  const pendiente = lista.find((p) => p.estado === 'PENDIENTE')
  const ultimo = lista[0]
  const hayValidado = lista.some((p) => p.estado === 'VALIDADO')
  const puedeSubir =
    tramite.estado === 'POR_PAGAR' &&
    !pendiente &&
    tienePermiso('pago:crear') &&
    pagos.datos !== undefined

  return (
    <section className="tarjeta seccion" aria-labelledby="titulo-pago">
      <h2 id="titulo-pago">Pago</h2>
      {tipo.monto > 0 && (
        <p>
          Monto a pagar: <strong>{quetzales(tipo.monto)}</strong>
        </p>
      )}

      {pagos.error !== undefined && (
        <>
          <AvisoError error={pagos.error} />
          <Boton variante="secundario" onClick={pagos.recargar}>
            Reintentar
          </Boton>
        </>
      )}
      {pagos.datos === undefined && pagos.error === undefined && (
        <Cargando texto="Cargando pagos..." />
      )}

      {hayValidado && (
        <Aviso tipo="exito">
          <p>El pago fue validado y el trámite quedó finalizado.</p>
        </Aviso>
      )}
      {tramite.estado === 'POR_PAGAR' && pendiente && (
        <Aviso tipo="info">
          <p>
            Recibimos tu comprobante. Un gestor lo revisará; vuelve a consultar este trámite para
            ver el resultado.
          </p>
        </Aviso>
      )}
      {tramite.estado === 'POR_PAGAR' && !pendiente && ultimo?.estado === 'RECHAZADO' && (
        <Aviso tipo="advertencia" titulo="Tu último comprobante fue rechazado">
          <p>{ultimo.comentario ?? 'Sube uno nuevo para continuar.'}</p>
        </Aviso>
      )}
      {tramite.estado === 'POR_PAGAR' &&
        pagos.datos !== undefined &&
        lista.length === 0 &&
        !puedeSubir && <p>Todavía no hay un comprobante de pago para este trámite.</p>}

      {puedeSubir && <FormularioComprobante tramiteId={tramite.id} alSubir={pagos.recargar} />}

      {lista.length > 0 && <ListaPagos pagos={lista} />}
    </section>
  )
}

function FormularioComprobante({ tramiteId, alSubir }: { tramiteId: number; alSubir: () => void }) {
  const id = useId()
  const [archivo, setArchivo] = useState<File | null>(null)
  const [reinicio, setReinicio] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const rechazo = archivo ? motivoDeRechazo(archivo) : null
  const motivoApi = motivoDeCampo(error, 'comprobante')
  const mostrado = rechazo ?? motivoApi

  function elegir(evento: ChangeEvent<HTMLInputElement>) {
    setArchivo(evento.target.files?.[0] ?? null)
    setError(null)
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (!archivo || rechazo) return
    setEnviando(true)
    setError(null)
    try {
      await subirComprobante(tramiteId, archivo)
      setArchivo(null)
      setReinicio((n) => n + 1)
      // Al recargarse los pagos el formulario se oculta y el aviso "Recibimos tu comprobante" toma su lugar
      alSubir()
    } catch (fallo) {
      setError(fallo)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="formulario" onSubmit={enviar} noValidate>
      <div className="campo">
        <label className="campo__etiqueta" htmlFor={id}>
          Comprobante de pago
        </label>
        <input
          key={reinicio}
          id={id}
          className="campo__entrada"
          type="file"
          accept={ACEPTADOS}
          aria-invalid={mostrado ? 'true' : 'false'}
          aria-describedby={`${id}-ayuda${mostrado ? ` ${id}-error` : ''}`}
          onChange={elegir}
        />
        <p className="campo__ayuda" id={`${id}-ayuda`}>
          PDF, JPG o PNG, de hasta 5 MB.
          {archivo && !rechazo && ` Elegiste ${archivo.name} (${tamanoLegible(archivo.size)}).`}
        </p>
        {mostrado && (
          <p className="campo__error" id={`${id}-error`}>
            {mostrado}
          </p>
        )}
      </div>
      {Boolean(error) && !motivoApi && <AvisoError error={error} mostrarCampos={false} />}
      <div className="acciones-formulario">
        <Boton
          type="submit"
          cargando={enviando}
          textoCargando="Subiendo..."
          disabled={!archivo || Boolean(rechazo)}
        >
          Subir comprobante
        </Boton>
      </div>
    </form>
  )
}

function ListaPagos({ pagos }: { pagos: Pago[] }) {
  return (
    <>
      <h3 className="subtitulo">Comprobantes enviados</h3>
      <ul className="lista-pagos">
        {pagos.map((pago) => (
          <FilaPago key={pago.id} pago={pago} />
        ))}
      </ul>
    </>
  )
}

function FilaPago({ pago }: { pago: Pago }) {
  const [descargando, setDescargando] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function descargar() {
    setDescargando(true)
    setError(null)
    try {
      const archivo = await descargarComprobante(pago.id)
      guardarArchivo(archivo.contenido, archivo.nombre, `comprobante-${pago.id}`)
    } catch (fallo) {
      setError(fallo)
    } finally {
      setDescargando(false)
    }
  }

  return (
    <li className="pago">
      <div className="pago__cabecera">
        <Insignia tono={TONO_PAGO[pago.estado]}>{ETIQUETA_PAGO[pago.estado]}</Insignia>
        <span>
          Enviado el {fechaHora(pago.creadoEn)} · {nombreDeTipo(pago.comprobanteTipo)} ·{' '}
          {tamanoLegible(pago.comprobanteTamano)}
        </span>
      </div>
      {pago.validadoEn && pago.estado === 'VALIDADO' && (
        <p>Validado el {fechaHora(pago.validadoEn)}</p>
      )}
      {pago.estado === 'RECHAZADO' && pago.comentario && (
        <p>
          <strong>Motivo del rechazo:</strong> {pago.comentario}
        </p>
      )}
      <Boton
        variante="secundario"
        cargando={descargando}
        textoCargando="Descargando..."
        aria-label={`Descargar el comprobante del pago ${pago.id}`}
        onClick={() => void descargar()}
      >
        Descargar comprobante
      </Boton>
      {Boolean(error) && <AvisoError error={error} />}
    </li>
  )
}
