import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import Aviso from '../componentes/Aviso'
import AvisoError from '../componentes/AvisoError'
import Boton from '../componentes/Boton'
import Campo from '../componentes/Campo'
import { useTitulo } from '../componentes/useTitulo'
import { useSesion } from '../sesion/contexto'
import { rutaInternaSegura } from './formularios'

interface EstadoDeNavegacion {
  desde?: unknown
  aviso?: string
}

export default function Ingresar() {
  const { estado, iniciarSesion } = useSesion()
  const ubicacion = useLocation()
  const navegacion = (ubicacion.state ?? {}) as EstadoDeNavegacion
  const destino = rutaInternaSegura(navegacion.desde, '/panel')
  useTitulo('Iniciar sesión')

  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [enviando, setEnviando] = useState(false)

  if (estado === 'autenticado') return <Navigate to={destino} replace />

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      await iniciarSesion(correo.trim(), clave)
    } catch (fallo) {
      setError(fallo)
      setClave('')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section className="tarjeta pagina-estrecha">
      <h1>Iniciar sesión</h1>
      {navegacion.aviso && <Aviso tipo="exito">{navegacion.aviso}</Aviso>}
      <form className="formulario" onSubmit={enviar} noValidate>
        <Campo
          etiqueta="Correo"
          type="email"
          autoComplete="username"
          required
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
        />
        <Campo
          etiqueta="Contraseña"
          type="password"
          autoComplete="current-password"
          required
          value={clave}
          onChange={(e) => setClave(e.target.value)}
        />
        {Boolean(error) && <AvisoError error={error} titulo="No se pudo iniciar sesión" />}
        <Boton
          type="submit"
          bloque
          cargando={enviando}
          textoCargando="Ingresando..."
          disabled={!correo.trim() || !clave}
        >
          Ingresar
        </Boton>
      </form>
      <p style={{ marginTop: '1rem' }}>
        ¿No tienes cuenta? <Link to="/registro">Crear cuenta</Link>
      </p>
    </section>
  )
}
