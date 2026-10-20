import { useEffect, useState } from 'react'
import { consultarSalud } from '../api/salud'

type Estado = 'comprobando' | 'disponible' | 'no-disponible'

const TEXTOS: Record<Estado, string> = {
  comprobando: 'Comprobando la conexión con el servidor...',
  disponible: 'Servidor disponible',
  'no-disponible': 'No se pudo conectar con el servidor',
}

export default function Inicio() {
  const [estado, setEstado] = useState<Estado>('comprobando')

  useEffect(() => {
    const control = new AbortController()
    consultarSalud(control.signal)
      .then((salud) => setEstado(salud.status === 'UP' ? 'disponible' : 'no-disponible'))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError'))
          setEstado('no-disponible')
      })
    return () => control.abort()
  }, [])

  return (
    <main>
      <h1>NovaGest</h1>
      <p>Sistema de trámites ciudadanos.</p>
      <p role="status" data-estado={estado}>
        {TEXTOS[estado]}
      </p>
    </main>
  )
}
