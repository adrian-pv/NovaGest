import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { consultarSalud } from '../api/salud'
import Insignia from '../componentes/Insignia'
import { useTitulo } from '../componentes/useTitulo'
import { useSesion } from '../sesion/contexto'

type Estado = 'comprobando' | 'disponible' | 'no-disponible'

const TEXTOS: Record<Estado, string> = {
  comprobando: 'Comprobando la conexión con el servidor...',
  disponible: 'Servidor disponible',
  'no-disponible': 'No se pudo conectar con el servidor',
}

const TONOS = { comprobando: 'neutra', disponible: 'exito', 'no-disponible': 'error' } as const

export default function Inicio() {
  const [estado, setEstado] = useState<Estado>('comprobando')
  const { estado: sesion } = useSesion()
  useTitulo()

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
    <section className="tarjeta hero">
      <h1>NovaGest</h1>
      <p>
        Registra tus trámites, paga y da seguimiento a su estado en un solo lugar, con el control de
        acceso y la trazabilidad que exige una auditoría.
      </p>
      <p role="status" data-estado={estado}>
        <Insignia tono={TONOS[estado]}>{TEXTOS[estado]}</Insignia>
      </p>
      {sesion === 'autenticado' && (
        <div className="acciones">
          <Link className="boton boton--primario" to="/panel">
            Ir a mi panel
          </Link>
        </div>
      )}
      {sesion === 'anonimo' && (
        <div className="acciones">
          <Link className="boton boton--primario" to="/ingresar">
            Iniciar sesión
          </Link>
          <Link className="boton boton--secundario" to="/registro">
            Crear cuenta
          </Link>
        </div>
      )}
    </section>
  )
}
