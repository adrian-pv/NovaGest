import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { SolicitudIngreso } from '../api/ingresos'
import AvisoError from '../componentes/AvisoError'
import Boton from '../componentes/Boton'
import Campo from '../componentes/Campo'
import { hoyEnGuatemala } from '../formato'
import {
  erroresDelServidor,
  MAX_DESCRIPCION,
  validar,
  type ErroresIngreso,
  type FormIngreso,
} from './formulario'

interface Props {
  inicial: FormIngreso
  textoGuardar: string
  /** Guarda el ingreso. Si falla, el error se muestra aquí mismo: lo normal es lanzar lo que dio la API. */
  onGuardar: (solicitud: SolicitudIngreso) => Promise<void>
}

/** Formulario de un ingreso, el mismo para crear y para editar. */
export default function FormularioIngreso({ inicial, textoGuardar, onGuardar }: Props) {
  const [form, setForm] = useState<FormIngreso>(inicial)
  const [errores, setErrores] = useState<ErroresIngreso>({})
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
      const dePeticion = erroresDelServidor(fallo)
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
          etiqueta="Fecha"
          type="date"
          max={hoyEnGuatemala()}
          error={errores.fecha}
          value={form.fecha}
          onChange={(e) => setForm({ ...form, fecha: e.target.value })}
        />
        <Campo
          etiqueta="Monto (Q)"
          ayuda="En quetzales, con hasta 2 decimales."
          error={errores.monto}
          inputMode="decimal"
          value={form.monto}
          onChange={(e) => setForm({ ...form, monto: e.target.value })}
        />
        <Campo
          etiqueta="Descripción (opcional)"
          ayuda="Por ejemplo: salario de octubre."
          error={errores.descripcion}
          value={form.descripcion}
          maxLength={MAX_DESCRIPCION}
          onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
        />
      </section>
      {Boolean(error) && <AvisoError error={error} />}
      <div className="acciones-formulario">
        <Boton type="submit" cargando={enviando} textoCargando="Guardando...">
          {textoGuardar}
        </Boton>
        <Link className="boton boton--secundario" to="/ingresos">
          Cancelar
        </Link>
      </div>
    </form>
  )
}
