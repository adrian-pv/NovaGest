import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { actualizarTramite } from '../api/tramites'
import Aviso from '../componentes/Aviso'
import AvisoError from '../componentes/AvisoError'
import Boton from '../componentes/Boton'
import Cargando from '../componentes/Cargando'
import { useDatos } from '../componentes/useDatos'
import { useTitulo } from '../componentes/useTitulo'
import NoEncontrado from '../paginas/NoEncontrado'
import { useSesion } from '../sesion/contexto'
import { cargarTramiteConTipo, idDeRuta, puedeEditarDatos, type TramiteConTipo } from './cargas'
import { aDatos, erroresDeDatos, erroresSinCampo, valoresIniciales, type Valores } from './datos'
import FormularioDatos from './FormularioDatos'

export default function EditarTramite() {
  const id = idDeRuta(useParams().id)
  if (id === null) return <NoEncontrado />
  return <Edicion id={id} />
}

function Edicion({ id }: { id: number }) {
  useTitulo(`Editar trámite #${id}`)
  const carga = useDatos(String(id), (senal) => cargarTramiteConTipo(id, senal))

  if (carga.error) {
    return (
      <>
        <AvisoError error={carga.error} />
        <Link to="/tramites">Volver a los trámites</Link>
      </>
    )
  }
  if (!carga.datos) return <Cargando texto="Cargando el trámite..." />
  // La clave reinicia el formulario si se vuelve a cargar el trámite
  return <FormularioEdicion key={carga.datos.tramite.actualizadoEn} datos={carga.datos} />
}

function FormularioEdicion({ datos }: { datos: TramiteConTipo }) {
  const { tramite, tipo } = datos
  const { perfil } = useSesion()
  const navegar = useNavigate()
  const [valores, setValores] = useState<Valores>(() =>
    valoresIniciales(tipo.campos, tramite.datos),
  )
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [error, setError] = useState<unknown>(null)
  const [enviando, setEnviando] = useState(false)

  if (!puedeEditarDatos(tramite, perfil?.alcanceTotal ?? false)) {
    return (
      <section className="tarjeta pagina-estrecha">
        <h1>Trámite #{tramite.id}</h1>
        <Aviso tipo="advertencia">
          <p>Este trámite ya no admite cambios en sus datos.</p>
        </Aviso>
        <Link to={`/tramites/${tramite.id}`}>Volver al trámite</Link>
      </section>
    )
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    const conversion = aDatos(tipo.campos, valores)
    setErrores(conversion.errores)
    setError(null)
    if (Object.keys(conversion.errores).length > 0) return
    setEnviando(true)
    try {
      await actualizarTramite(tramite.id, conversion.datos)
      void navegar(`/tramites/${tramite.id}`, { state: { aviso: 'Guardamos los cambios.' } })
    } catch (fallo) {
      setError(fallo)
      setErrores(erroresDeDatos(fallo))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <div className="encabezado-pagina">
        <h1>Editar trámite #{tramite.id}</h1>
        <p>{tipo.nombre}</p>
      </div>
      <section className="tarjeta pagina-media">
        {tramite.estado === 'OBSERVADO' && tramite.motivo && (
          <Aviso tipo="advertencia" titulo="Qué debes corregir">
            <p>{tramite.motivo}</p>
          </Aviso>
        )}
        <form className="formulario" onSubmit={guardar} noValidate>
          <FormularioDatos
            campos={tipo.campos}
            valores={valores}
            errores={errores}
            onCambio={(clave, valor) => setValores((v) => ({ ...v, [clave]: valor }))}
          />
          {Boolean(error) && erroresSinCampo(error, tipo.campos) && (
            <AvisoError error={error} mostrarCampos={false} />
          )}
          <div className="acciones-formulario">
            <Boton type="submit" cargando={enviando} textoCargando="Guardando...">
              Guardar cambios
            </Boton>
            <Link className="boton boton--secundario" to={`/tramites/${tramite.id}`}>
              Cancelar
            </Link>
          </div>
        </form>
      </section>
    </>
  )
}
