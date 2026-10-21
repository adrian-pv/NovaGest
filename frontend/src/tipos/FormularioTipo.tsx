import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { SolicitudTipo } from '../api/tramites'
import AreaTexto from '../componentes/AreaTexto'
import AvisoError from '../componentes/AvisoError'
import Boton from '../componentes/Boton'
import Campo from '../componentes/Campo'
import EditorCampos from './EditorCampos'
import { erroresDelServidor, validar, type ErroresTipo, type FormTipo } from './formulario'

interface Props {
  inicial: FormTipo
  textoGuardar: string
  /** Guarda el tipo. Si falla, el error se muestra aquí mismo: lo normal es lanzar lo que dio la API. */
  onGuardar: (solicitud: SolicitudTipo) => Promise<void>
}

/** Formulario de un tipo de trámite, el mismo para crear y para editar. */
export default function FormularioTipo({ inicial, textoGuardar, onGuardar }: Props) {
  const [form, setForm] = useState<FormTipo>(inicial)
  const [errores, setErrores] = useState<ErroresTipo>({ filas: {} })
  const [error, setError] = useState<unknown>(null)
  const [enviando, setEnviando] = useState(false)

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    setError(null)
    const revision = validar(form)
    setErrores(revision.errores)
    if (!revision.solicitud) return
    setEnviando(true)
    try {
      await onGuardar(revision.solicitud)
    } catch (fallo) {
      const dePeticion = erroresDelServidor(fallo, form)
      setErrores(dePeticion.errores)
      setError(dePeticion.aviso)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="formulario" onSubmit={guardar} noValidate>
      <section className="tarjeta pagina-media">
        <Campo
          etiqueta="Nombre"
          error={errores.nombre}
          value={form.nombre}
          maxLength={100}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
        />
        <AreaTexto
          etiqueta="Descripción (opcional)"
          error={errores.descripcion}
          value={form.descripcion}
          maxLength={255}
          onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
        />
        <Campo
          etiqueta="Monto a pagar (Q)"
          ayuda="Escribe 0 si el trámite no tiene costo."
          error={errores.monto}
          inputMode="decimal"
          value={form.monto}
          onChange={(e) => setForm({ ...form, monto: e.target.value })}
        />
        <div className="campo campo--casilla">
          <label>
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(e) => setForm({ ...form, activo: e.target.checked })}
            />{' '}
            Activo (las personas pueden iniciar este trámite)
          </label>
        </div>
      </section>
      <section className="tarjeta pagina-media">
        <EditorCampos
          campos={form.campos}
          errores={errores}
          onCambio={(campos) => setForm({ ...form, campos })}
        />
      </section>
      {Boolean(error) && <AvisoError error={error} />}
      <div className="acciones-formulario">
        <Boton type="submit" cargando={enviando} textoCargando="Guardando...">
          {textoGuardar}
        </Boton>
        <Link className="boton boton--secundario" to="/tipos">
          Cancelar
        </Link>
      </div>
    </form>
  )
}
