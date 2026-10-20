import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useSesion } from '../sesion/contexto'
import { mensajeDeError, rutaInternaSegura } from './formularios'

interface EstadoDeNavegacion {
  desde?: unknown
  aviso?: string
}

export default function Ingresar() {
  const { estado, iniciarSesion } = useSesion()
  const ubicacion = useLocation()
  const navegacion = (ubicacion.state ?? {}) as EstadoDeNavegacion
  const destino = rutaInternaSegura(navegacion.desde, '/panel')

  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  if (estado === 'autenticado') return <Navigate to={destino} replace />

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      await iniciarSesion(correo.trim(), clave)
    } catch (fallo) {
      setError(mensajeDeError(fallo))
      setClave('')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main>
      <h1>Iniciar sesión</h1>
      {navegacion.aviso && <p role="status">{navegacion.aviso}</p>}
      <form onSubmit={enviar} noValidate>
        <p>
          <label htmlFor="correo">Correo</label>
          <br />
          <input
            id="correo"
            type="email"
            autoComplete="username"
            required
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
          />
        </p>
        <p>
          <label htmlFor="clave">Contraseña</label>
          <br />
          <input
            id="clave"
            type="password"
            autoComplete="current-password"
            required
            value={clave}
            onChange={(e) => setClave(e.target.value)}
          />
        </p>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={enviando || !correo.trim() || !clave}>
          {enviando ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
      <p>
        ¿No tienes cuenta? <Link to="/registro">Crear cuenta</Link>
      </p>
    </main>
  )
}
