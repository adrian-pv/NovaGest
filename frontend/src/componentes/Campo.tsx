import { useId, type InputHTMLAttributes } from 'react'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  etiqueta: string
  /** Motivo por el que el campo es inválido; se anuncia junto al campo. */
  error?: string
  ayuda?: string
}

/**
 * Campo de formulario accesible: la etiqueta queda asociada al campo, y el error y la ayuda se enlazan con
 * aria-describedby para que los lectores de pantalla los lean al enfocarlo.
 */
export default function Campo({ etiqueta, error, ayuda, className, ...resto }: Props) {
  const id = useId()
  const idAyuda = `${id}-ayuda`
  const idError = `${id}-error`
  const descrito = [ayuda ? idAyuda : '', error ? idError : ''].filter(Boolean).join(' ')
  return (
    <div className="campo">
      <label className="campo__etiqueta" htmlFor={id}>
        {etiqueta}
      </label>
      <input
        {...resto}
        id={id}
        className={['campo__entrada', className ?? ''].filter(Boolean).join(' ')}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={descrito || undefined}
      />
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
