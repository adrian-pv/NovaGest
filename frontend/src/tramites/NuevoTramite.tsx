import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { crearTramite, listarTipos } from '../api/tramites'
import Aviso from '../componentes/Aviso'
import AvisoError from '../componentes/AvisoError'
import Boton from '../componentes/Boton'
import Cargando from '../componentes/Cargando'
import Seleccion from '../componentes/Seleccion'
import { useDatos } from '../componentes/useDatos'
import { useTitulo } from '../componentes/useTitulo'
import { quetzales } from '../formato'
import { aDatos, erroresDeDatos, erroresSinCampo, valoresIniciales, type Valores } from './datos'
import FormularioDatos from './FormularioDatos'

export default function NuevoTramite() {
  useTitulo('Nuevo trámite')
  const navegar = useNavigate()
  const tipos = useDatos('tipos', (senal) => listarTipos(senal))
  const [tipoId, setTipoId] = useState('')
  const [valores, setValores] = useState<Valores>({})
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [error, setError] = useState<unknown>(null)
  const [enviando, setEnviando] = useState(false)

  // Quien no administra solo recibe tipos activos; se filtra también aquí por si el rol puede ver los inactivos
  const disponibles = (tipos.datos?.content ?? []).filter((t) => t.activo)
  const tipo = disponibles.find((t) => String(t.id) === tipoId)

  function elegirTipo(id: string) {
    setTipoId(id)
    setErrores({})
    setError(null)
    const elegido = disponibles.find((t) => String(t.id) === id)
    setValores(elegido ? valoresIniciales(elegido.campos) : {})
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    if (!tipo) return
    const conversion = aDatos(tipo.campos, valores)
    setErrores(conversion.errores)
    setError(null)
    if (Object.keys(conversion.errores).length > 0) return
    setEnviando(true)
    try {
      const creado = await crearTramite(tipo.id, conversion.datos)
      void navegar(`/tramites/${creado.id}`, {
        state: {
          aviso: 'Guardamos tu trámite como borrador. Revísalo y envíalo cuando esté completo.',
        },
      })
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
        <h1>Nuevo trámite</h1>
        <p>
          Elige el tipo de trámite y llena sus datos. Puedes guardarlo incompleto y terminarlo
          después.
        </p>
      </div>
      <section className="tarjeta pagina-media">
        {tipos.cargando && !tipos.datos && <Cargando texto="Cargando los tipos de trámite..." />}
        {Boolean(tipos.error) && (
          <>
            <AvisoError error={tipos.error} />
            <Boton variante="secundario" onClick={tipos.recargar}>
              Reintentar
            </Boton>
          </>
        )}
        {tipos.datos && disponibles.length === 0 && (
          <Aviso tipo="advertencia">No hay tipos de trámite disponibles por ahora.</Aviso>
        )}
        {tipos.datos && disponibles.length > 0 && (
          <form className="formulario" onSubmit={guardar} noValidate>
            <Seleccion
              etiqueta="Tipo de trámite"
              opcionVacia="Elige un tipo"
              opciones={disponibles.map((t) => ({ valor: String(t.id), texto: t.nombre }))}
              value={tipoId}
              onChange={(e) => elegirTipo(e.target.value)}
            />
            {tipo && (
              <>
                {(tipo.descripcion || tipo.monto > 0) && (
                  <Aviso tipo="info">
                    {tipo.descripcion && <p>{tipo.descripcion}</p>}
                    {tipo.monto > 0 && <p>Costo: {quetzales(tipo.monto)}</p>}
                  </Aviso>
                )}
                <FormularioDatos
                  campos={tipo.campos}
                  valores={valores}
                  errores={errores}
                  onCambio={(clave, valor) => setValores((v) => ({ ...v, [clave]: valor }))}
                />
              </>
            )}
            {Boolean(error) && erroresSinCampo(error, tipo?.campos ?? []) && (
              <AvisoError error={error} mostrarCampos={false} />
            )}
            <div className="acciones-formulario">
              <Boton
                type="submit"
                cargando={enviando}
                textoCargando="Guardando..."
                disabled={!tipo}
              >
                Guardar borrador
              </Boton>
              <Link className="boton boton--secundario" to="/tramites">
                Cancelar
              </Link>
            </div>
          </form>
        )}
      </section>
    </>
  )
}
