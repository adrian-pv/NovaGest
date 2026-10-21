import { useId, type TextareaHTMLAttributes } from 'react'

interface Props extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  etiqueta: string
  error?: string
  ayuda?: string
}

/** Cuadro de texto de varias líneas (comentarios, motivos), con etiqueta, ayuda y error accesibles. */
export default function AreaTexto({ etiqueta, error, ayuda, className, ...resto }: Props) {
  const id = useId()
  const idAyuda = `${id}-ayuda`
  const idError = `${id}-error`
  const descrito = [ayuda ? idAyuda : '', error ? idError : ''].filter(Boolean).join(' ')
  return (
    <div className="campo">
      <label className="campo__etiqueta" htmlFor={id}>
        {etiqueta}
      </label>
      <textarea
        rows={3}
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
