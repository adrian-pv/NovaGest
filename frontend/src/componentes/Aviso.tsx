import type { ReactNode } from 'react'

export type TipoAviso = 'info' | 'exito' | 'advertencia' | 'error'

interface Props {
  tipo?: TipoAviso
  titulo?: string
  children: ReactNode
}

/**
 * Mensaje destacado. Los errores usan role="alert" (se anuncian de inmediato a lectores de pantalla); el resto
 * usa role="status", que se anuncia sin interrumpir.
 */
export default function Aviso({ tipo = 'info', titulo, children }: Props) {
  return (
    <div className={`aviso aviso--${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}>
      {titulo && <strong className="aviso__titulo">{titulo}</strong>}
      {children}
    </div>
  )
}
