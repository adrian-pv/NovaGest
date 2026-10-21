import { useId, type SelectHTMLAttributes } from 'react'

export interface OpcionSeleccion {
  valor: string
  texto: string
}

interface Props extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  etiqueta: string
  opciones: OpcionSeleccion[]
  /** Texto de la opción sin valor (por ejemplo "Todos" o "Elige un tipo"). Sin él no hay opción vacía. */
  opcionVacia?: string
  error?: string
  ayuda?: string
}

/** Lista desplegable accesible, con el mismo aspecto y la misma asociación de etiqueta y error que `Campo`. */
export default function Seleccion({
  etiqueta,
  opciones,
  opcionVacia,
  error,
  ayuda,
  className,
  ...resto
}: Props) {
  const id = useId()
  const idAyuda = `${id}-ayuda`
  const idError = `${id}-error`
  const descrito = [ayuda ? idAyuda : '', error ? idError : ''].filter(Boolean).join(' ')
  return (
    <div className="campo">
      <label className="campo__etiqueta" htmlFor={id}>
        {etiqueta}
      </label>
      <select
        {...resto}
        id={id}
        className={['campo__entrada', className ?? ''].filter(Boolean).join(' ')}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={descrito || undefined}
      >
        {opcionVacia !== undefined && <option value="">{opcionVacia}</option>}
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
      {ayuda && (
        <p className="campo__ayuda" id={idAyuda}>
          {ayuda}
        </p>
      )}
      {error && (
        <p className="campo__error" id={idError}>
          {error}
        </p>
      )}
    </div>
  )
}
