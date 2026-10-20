import type { ReactNode } from 'react'

interface Props {
  tono?: 'info' | 'exito' | 'advertencia' | 'error' | 'neutra'
  children: ReactNode
}

/** Etiqueta pequeña, por ejemplo para el estado de un trámite o el rol de una persona. */
export default function Insignia({ tono = 'info', children }: Props) {
  return <span className={`insignia insignia--${tono}`}>{children}</span>
}
