import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import {
  historialDeTramite,
  transicionar,
  transicionesDisponibles,
  type CampoTipo,
  type DatosTramite,
  type Historial,
  type TransicionDisponible,
} from '../api/tramites'
import Aviso from '../componentes/Aviso'
import AvisoError from '../componentes/AvisoError'
import AreaTexto from '../componentes/AreaTexto'
import Boton from '../componentes/Boton'
import Cargando from '../componentes/Cargando'
import { useDatos } from '../componentes/useDatos'
import { useTitulo } from '../componentes/useTitulo'
import { fechaHora, numero, soloFecha } from '../formato'
import NoEncontrado from '../paginas/NoEncontrado'
import { useSesion } from '../sesion/contexto'
import { presentacionDe, resultadoDe } from './acciones'
import { cargarTramiteConTipo, idDeRuta, puedeEditarDatos } from './cargas'
import EstadoInsignia from './EstadoInsignia'

export default function DetalleTramite() {
  const id = idDeRuta(useParams().id)
  if (id === null) return <NoEncontrado />
  return <Detalle id={id} />
}

function valorLegible(campo: CampoTipo, datos: DatosTramite): string {
  const valor = datos[campo.clave]
  if (valor === undefined || valor === null || valor === '') return '—'
  if (campo.tipoDato === 'BOOLEANO') return valor === true ? 'Sí' : 'No'
  if (campo.tipoDato === 'FECHA') return soloFecha(String(valor))
  if (campo.tipoDato === 'NUMERO' && typeof valor === 'number') return numero(valor)
  return String(valor)
}

function Detalle({ id }: { id: number }) {
  const { perfil, tienePermiso } = useSesion()
  const ubicacion = useLocation()
  const avisoDeNavegacion = (ubicacion.state as { aviso?: string } | null)?.aviso
  useTitulo(`Trámite #${id}`)

  const carga = useDatos(String(id), (senal) => cargarTramiteConTipo(id, senal))
  const historial = useDatos(String(id), (senal) => historialDeTramite(id, senal))
  const acciones = useDatos(String(id), (senal) => transicionesDisponibles(id, senal))

  // Acción elegida que pide comentario, y su resultado
  const [pendiente, setPendiente] = useState<TransicionDisponible | null>(null)
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [errorAccion, setErrorAccion] = useState<unknown>(null)
  const [resultado, setResultado] = useState<string | null>(null)

  if (carga.error) {
    return (
      <>
        <AvisoError error={carga.error} />
        <p>
          <Link to="/tramites">Volver a los trámites</Link>
        </p>
      </>
    )
  }
  if (!carga.datos) return <Cargando texto="Cargando el trámite..." />
  const { tramite, tipo } = carga.datos

  async function ejecutar(accion: TransicionDisponible, texto?: string) {
    setEnviando(true)
    setErrorAccion(null)
    setResultado(null)
    try {
      const actualizado = await transicionar(id, accion.estadoDestino, texto)
      setPendiente(null)
      setComentario('')
      setResultado(resultadoDe(actualizado.estado))
      carga.recargar()
      historial.recargar()
      acciones.recargar()
    } catch (fallo) {
      setErrorAccion(fallo)
    } finally {
      setEnviando(false)
    }
  }

  function elegir(accion: TransicionDisponible) {
    setErrorAccion(null)
    setResultado(null)
    if (accion.comentarioObligatorio) {
      setPendiente(accion)
      setComentario('')
    } else {
      void ejecutar(accion)
    }
  }

  const puedeEditar =
    tienePermiso('tramite:editar') && puedeEditarDatos(tramite, perfil?.alcanceTotal ?? false)
  const lista = [...tipo.campos].sort((a, b) => a.orden - b.orden)

  return (
    <>
      <p>
        <Link to="/tramites">← Volver a los trámites</Link>
      </p>
      <div className="encabezado-pagina encabezado-con-accion">
        <div>
          <h1>
            Trámite #{tramite.id} <EstadoInsignia estado={tramite.estado} />
          </h1>
          <p>
            {tramite.tipoNombre} · creado el {fechaHora(tramite.creadoEn)}
          </p>
        </div>
        {puedeEditar && (
          <Link className="boton boton--secundario" to={`/tramites/${tramite.id}/editar`}>
            Editar datos
          </Link>
        )}
      </div>

      {avisoDeNavegacion && !resultado && <Aviso tipo="exito">{avisoDeNavegacion}</Aviso>}
      {resultado && <Aviso tipo="exito">{resultado}</Aviso>}
      {tramite.motivo && (tramite.estado === 'OBSERVADO' || tramite.estado === 'RECHAZADO') && (
        <Aviso
          tipo={tramite.estado === 'RECHAZADO' ? 'error' : 'advertencia'}
          titulo={tramite.estado === 'RECHAZADO' ? 'Motivo del rechazo' : 'Qué debe corregirse'}
        >
          <p>{tramite.motivo}</p>
        </Aviso>
      )}

      <section className="tarjeta seccion" aria-labelledby="titulo-datos">
        <h2 id="titulo-datos">Datos del trámite</h2>
        {lista.length === 0 ? (
          <p>Este tipo de trámite no pide datos.</p>
        ) : (
          <dl className="datos">
            {lista.map((campo) => (
              <div key={campo.clave} className="datos__fila">
                <dt>{campo.etiqueta}</dt>
                <dd>{valorLegible(campo, tramite.datos)}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="tarjeta seccion" aria-labelledby="titulo-acciones">
        <h2 id="titulo-acciones">Qué puedes hacer ahora</h2>
        {acciones.error !== undefined && <AvisoError error={acciones.error} />}
        {acciones.datos && acciones.datos.length === 0 && (
          <p>No hay acciones disponibles para ti en este momento.</p>
        )}
        {acciones.datos && acciones.datos.length > 0 && (
          <ul className="acciones-tramite">
            {acciones.datos.map((accion) => {
              const { texto, variante } = presentacionDe(accion.accion)
              return (
                <li key={accion.accion}>
                  <Boton
                    variante={variante}
                    disabled={!accion.ejecutable || enviando}
                    onClick={() => elegir(accion)}
                  >
                    {texto}
                  </Boton>
                  {!accion.ejecutable && accion.motivo && (
                    <p className="campo__ayuda">{accion.motivo}</p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {pendiente && (
          <form
            className="formulario"
            onSubmit={(e) => {
              e.preventDefault()
              void ejecutar(pendiente, comentario)
            }}
          >
            <AreaTexto
              etiqueta={`Comentario para "${presentacionDe(pendiente.accion).texto}"`}
              ayuda="Obligatorio. La persona lo verá en el historial del trámite."
              maxLength={500}
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
            />
            <div className="acciones-formulario">
              <Boton
                type="submit"
                variante={presentacionDe(pendiente.accion).variante}
                cargando={enviando}
                textoCargando="Guardando..."
                disabled={!comentario.trim()}
              >
                Confirmar
              </Boton>
              <Boton variante="secundario" onClick={() => setPendiente(null)}>
                Cancelar
              </Boton>
            </div>
          </form>
        )}
        {Boolean(errorAccion) && <AvisoError error={errorAccion} />}
      </section>

      <section className="tarjeta seccion" aria-labelledby="titulo-historial">
        <h2 id="titulo-historial">Historial</h2>
        {historial.error !== undefined && <AvisoError error={historial.error} />}
        {historial.datos && <TablaHistorial filas={historial.datos} miId={perfil?.id ?? null} />}
        {!historial.datos && historial.error === undefined && <Cargando />}
      </section>
    </>
  )
}

function TablaHistorial({ filas, miId }: { filas: Historial[]; miId: number | null }) {
  if (filas.length === 0) return <p className="vacio">Todavía no hay movimientos.</p>
  return (
    <div className="tabla-contenedor">
      <table className="tabla">
        <caption className="solo-lectores">Historial de cambios de estado</caption>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Cambio</th>
            <th scope="col">Quién</th>
            <th scope="col">Comentario</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.id}>
              <td>{fechaHora(fila.fecha)}</td>
              <td>
                {fila.estadoAnterior ? (
                  <>
                    <EstadoInsignia estado={fila.estadoAnterior} /> →{' '}
                    <EstadoInsignia estado={fila.estadoNuevo} />
                  </>
                ) : (
                  <>
                    Creado como <EstadoInsignia estado={fila.estadoNuevo} />
                  </>
                )}
              </td>
              <td>{fila.actorId === miId ? 'Tú' : `Usuario #${fila.actorId}`}</td>
              <td>{fila.comentario ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
