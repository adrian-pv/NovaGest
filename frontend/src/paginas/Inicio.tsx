import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { consultarSalud } from '../api/salud'
import { useSesion } from '../sesion/contexto'

type Estado = 'comprobando' | 'disponible' | 'no-disponible'

const TEXTOS: Record<Estado, string> = {
  comprobando: 'Comprobando la conexión con el servidor...',
  disponible: 'Servidor disponible',
  'no-disponible': 'No se pudo conectar con el servidor',
}

export default function Inicio() {
  const [estado, setEstado] = useState<Estado>('comprobando')
  const { estado: sesion } = useSesion()

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
      {sesion === 'autenticado' && (
        <p>
          <Link to="/panel">Ir a mi panel</Link>
        </p>
      )}
      {sesion === 'anonimo' && (
        <p>
          <Link to="/ingresar">Iniciar sesión</Link> · <Link to="/registro">Crear cuenta</Link>
        </p>
      )}
    </main>
  )
}
