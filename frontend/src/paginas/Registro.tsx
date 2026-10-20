import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { registrar } from '../api/auth'
import { useSesion } from '../sesion/contexto'
import { mensajeDeError, motivoDeCampo } from './formularios'

export default function Registro() {
  const { estado } = useSesion()
  const navegar = useNavigate()

  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [enviando, setEnviando] = useState(false)

  if (estado === 'autenticado') return <Navigate to="/panel" replace />

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      await registrar({ nombre: nombre.trim(), correo: correo.trim(), clave })
      void navegar('/ingresar', {
        replace: true,
        state: { aviso: 'Tu cuenta fue creada. Ya puedes iniciar sesión.' },
      })
    } catch (fallo) {
      setError(fallo)
      setClave('')
    } finally {
      setEnviando(false)
    }
  }

  const motivoNombre = motivoDeCampo(error, 'nombre')
  const motivoCorreo = motivoDeCampo(error, 'correo')
  const motivoClave = motivoDeCampo(error, 'clave')
  const hayMotivoDeCampo = Boolean(motivoNombre || motivoCorreo || motivoClave)

  return (
    <main>
      <h1>Crear cuenta</h1>
      <form onSubmit={enviar} noValidate>
        <p>
          <label htmlFor="nombre">Nombre completo</label>
          <br />
          <input
            id="nombre"
            autoComplete="name"
            required
            maxLength={120}
            aria-invalid={Boolean(motivoNombre)}
            aria-describedby={motivoNombre ? 'error-nombre' : undefined}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          {motivoNombre && <span id="error-nombre"> {motivoNombre}</span>}
        </p>
        <p>
          <label htmlFor="correo">Correo</label>
          <br />
          <input
            id="correo"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            aria-invalid={Boolean(motivoCorreo)}
            aria-describedby={motivoCorreo ? 'error-correo' : undefined}
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
          />
          {motivoCorreo && <span id="error-correo"> {motivoCorreo}</span>}
        </p>
        <p>
          <label htmlFor="clave">Contraseña (mínimo 8 caracteres)</label>
          <br />
          <input
            id="clave"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            aria-invalid={Boolean(motivoClave)}
            aria-describedby={motivoClave ? 'error-clave' : undefined}
            value={clave}
            onChange={(e) => setClave(e.target.value)}
          />
          {motivoClave && <span id="error-clave"> {motivoClave}</span>}
        </p>
        {Boolean(error) && !hayMotivoDeCampo && <p role="alert">{mensajeDeError(error)}</p>}
        <button
          type="submit"
          disabled={enviando || !nombre.trim() || !correo.trim() || clave.length < 8}
        >
          {enviando ? 'Creando cuenta...' : 'Crear cuenta'}
        </button>
      </form>
      <p>
        ¿Ya tienes cuenta? <Link to="/ingresar">Iniciar sesión</Link>
      </p>
    </main>
  )
}
