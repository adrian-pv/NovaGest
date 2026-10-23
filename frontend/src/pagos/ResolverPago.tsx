import { useRef, useState, type FormEvent } from 'react'
import { resolverPago, type DecisionPago, type Pago } from '../api/pagos'
import { ErrorApi } from '../api/errores'
import AreaTexto from '../componentes/AreaTexto'
import AvisoError from '../componentes/AvisoError'
import Boton from '../componentes/Boton'
import { useSesion } from '../sesion/contexto'

/** La API vuelve a comprobar permiso, autoría y estado al resolver el pago. */
export default function ResolverPago({ pago, alResolver }: { pago: Pago; alResolver: () => void }) {
  const { perfil, tienePermiso } = useSesion()
  const [decision, setDecision] = useState<DecisionPago | null>(null)
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resuelto, setResuelto] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const ocupado = useRef(false)
  if (pago.estado !== 'PENDIENTE' || !tienePermiso('pago:editar')) return null
  if (perfil?.id === pago.creadoPor) return <p>No puedes resolver un pago que tú registraste.</p>
  if (resuelto) return <p role="status">Decisión guardada. Actualizando el pago...</p>

  function elegir(valor: DecisionPago) {
    setDecision(valor)
    setComentario('')
    setError(null)
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (!decision || ocupado.current || (decision === 'RECHAZAR' && !comentario.trim())) return
    ocupado.current = true
    setEnviando(true)
    setError(null)
    try {
      await resolverPago(pago.id, decision, comentario)
      setResuelto(true)
      setDecision(null)
      alResolver()
    } catch (fallo) {
      setError(fallo)
    } finally {
      ocupado.current = false
      setEnviando(false)
    }
  }

  return (
    <div className="seccion">
      {!decision ? (
        <div className="acciones-formulario">
          {/* El nombre accesible lleva el número: en la lista hay un par de botones por fila. */}
          <Boton aria-label={`Validar el pago ${pago.id}`} onClick={() => elegir('VALIDAR')}>
            Validar pago
          </Boton>
          <Boton
            variante="peligro"
            aria-label={`Rechazar el pago ${pago.id}`}
            onClick={() => elegir('RECHAZAR')}
          >
            Rechazar pago
          </Boton>
        </div>
      ) : (
        <form className="formulario" onSubmit={enviar}>
          <p>
            {decision === 'VALIDAR'
              ? 'Al validar el pago, el trámite quedará finalizado. Revisa el comprobante antes de confirmar.'
              : 'El trámite seguirá por pagar y el ciudadano podrá enviar otro comprobante.'}
          </p>
          <AreaTexto
            etiqueta={decision === 'RECHAZAR' ? 'Motivo del rechazo' : 'Comentario de validación'}
            ayuda={
              decision === 'RECHAZAR'
                ? 'Obligatorio. Explica qué debe corregir el ciudadano.'
                : 'Opcional.'
            }
            required={decision === 'RECHAZAR'}
            maxLength={500}
            value={comentario}
            disabled={enviando}
            onChange={(e) => setComentario(e.target.value)}
          />
          {Boolean(error) && <AvisoError error={error} />}
          {error instanceof ErrorApi && error.estado === 409 ? (
            <Boton variante="secundario" onClick={alResolver}>
              Actualizar estado del pago
            </Boton>
          ) : (
            <Boton
              type="submit"
              cargando={enviando}
              textoCargando="Guardando decisión..."
              disabled={decision === 'RECHAZAR' && !comentario.trim()}
              variante={decision === 'RECHAZAR' ? 'peligro' : 'primario'}
            >
              {decision === 'VALIDAR' ? 'Confirmar validación' : 'Confirmar rechazo'}
            </Boton>
          )}
          <Boton variante="secundario" disabled={enviando} onClick={() => setDecision(null)}>
            Cancelar
          </Boton>
        </form>
      )}
    </div>
  )
}
