import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { registrar } from '../api/auth'
import AvisoError from '../componentes/AvisoError'
import Boton from '../componentes/Boton'
import Campo from '../componentes/Campo'
import { useTitulo } from '../componentes/useTitulo'
import { useSesion } from '../sesion/contexto'
import { motivoDeCampo } from './formularios'

export default function Registro() {
  const { estado } = useSesion()
  const navegar = useNavigate()
  useTitulo('Crear cuenta')

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
    <section className="tarjeta pagina-estrecha">
      <h1>Crear cuenta</h1>
      <form className="formulario" onSubmit={enviar} noValidate>
        <Campo
          etiqueta="Nombre completo"
          autoComplete="name"
          required
          maxLength={120}
          error={motivoNombre}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <Campo
          etiqueta="Correo"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          error={motivoCorreo}
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
        />
        <Campo
          etiqueta="Contraseña"
          ayuda="Mínimo 8 caracteres."
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={72}
          error={motivoClave}
          value={clave}
          onChange={(e) => setClave(e.target.value)}
        />
        {Boolean(error) && (
          <AvisoError
            error={error}
            titulo={hayMotivoDeCampo ? 'Revisa los datos' : undefined}
            mostrarCampos={false}
          />
        )}
        <Boton
          type="submit"
          bloque
          cargando={enviando}
          textoCargando="Creando cuenta..."
          disabled={!nombre.trim() || !correo.trim() || clave.length < 8}
        >
          Crear cuenta
        </Boton>
      </form>
      <p style={{ marginTop: '1rem' }}>
        ¿Ya tienes cuenta? <Link to="/ingresar">Iniciar sesión</Link>
      </p>
    </section>
  )
}
