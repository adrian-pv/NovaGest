import type { ButtonHTMLAttributes } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: 'primario' | 'secundario' | 'peligro'
  /** Ocupa todo el ancho disponible (formularios angostos). */
  bloque?: boolean
  /** Mientras es verdadero se desactiva y muestra `textoCargando` para evitar envíos dobles. */
  cargando?: boolean
  textoCargando?: string
}

export default function Boton({
  variante = 'primario',
  bloque = false,
  cargando = false,
  textoCargando,
  type = 'button',
  disabled,
  className,
  children,
  ...resto
}: Props) {
  const clases = ['boton', `boton--${variante}`, bloque ? 'boton--bloque' : '', className ?? '']
    .filter(Boolean)
    .join(' ')
  return (
    <button
      {...resto}
      type={type}
      className={clases}
      disabled={disabled || cargando}
      aria-busy={cargando}
    >
      {cargando && textoCargando ? textoCargando : children}
    </button>
  )
}
