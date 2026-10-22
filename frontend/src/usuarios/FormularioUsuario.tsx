import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { Rol, SolicitudUsuarioActualizar, SolicitudUsuarioCrear } from '../api/usuarios'
import Aviso from '../componentes/Aviso'
import AvisoError from '../componentes/AvisoError'
import Boton from '../componentes/Boton'
import Campo from '../componentes/Campo'
import SelectorDeRoles from './SelectorDeRoles'
import {
  alternarRol,
  erroresDelServidor,
  validarCreacion,
  validarEdicion,
  type ErroresUsuario,
  type FormUsuario,
} from './formulario'

interface PropsComunes {
  inicial: FormUsuario
  roles: Rol[]
}

type Props = PropsComunes &
  (
    | { modo: 'crear'; onGuardar: (solicitud: SolicitudUsuarioCrear) => Promise<void> }
    | {
        modo: 'editar'
        /** Si es la cuenta de quien está editando: la API no deja cambiar sus roles ni desactivarla. */
        propio: boolean
        onGuardar: (solicitud: SolicitudUsuarioActualizar) => Promise<void>
      }
  )

/** Formulario de un usuario: crear (con correo y clave) o editar (nombre, estado y roles). */
export default function FormularioUsuario(props: Props) {
  const { inicial, roles } = props
  const [form, setForm] = useState<FormUsuario>(inicial)
  const [errores, setErrores] = useState<ErroresUsuario>({})
  const [error, setError] = useState<unknown>(null)
  const [enviando, setEnviando] = useState(false)
  const propio = props.modo === 'editar' && props.propio

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      if (props.modo === 'crear') {
        const revision = validarCreacion(form)
        setErrores(revision.errores)
        if (!revision.solicitud) return
        await props.onGuardar(revision.solicitud)
      } else {
        const revision = validarEdicion(form)
        setErrores(revision.errores)
        if (!revision.solicitud) return
        await props.onGuardar(revision.solicitud)
      }
    } catch (fallo) {
      const dePeticion = erroresDelServidor(fallo)
      setErrores(dePeticion.errores)
      setError(dePeticion.aviso)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="formulario" onSubmit={guardar} noValidate>
      <section className="tarjeta pagina-media">
        <Campo
          etiqueta="Nombre"
          error={errores.nombre}
          value={form.nombre}
          maxLength={120}
          autoComplete="off"
          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
        />
        {props.modo === 'crear' ? (
          <>
            <Campo
              etiqueta="Correo"
              type="email"
              error={errores.correo}
              value={form.correo}
              maxLength={254}
              autoComplete="off"
              onChange={(e) => setForm({ ...form, correo: e.target.value })}
            />
            <Campo
              etiqueta="Clave inicial"
              type="password"
              ayuda="De 8 a 72 caracteres. Compártela por un medio seguro."
              error={errores.clave}
              value={form.clave}
              maxLength={72}
              autoComplete="new-password"
              onChange={(e) => setForm({ ...form, clave: e.target.value })}
            />
          </>
        ) : (
          <p className="campo__ayuda">
            Correo: <strong>{form.correo}</strong> (no se puede cambiar aquí).
          </p>
        )}
        {props.modo === 'editar' && (
          <div className="campo campo--casilla">
            <label>
              <input
                type="checkbox"
                checked={form.activo}
                disabled={propio}
                onChange={(e) => setForm({ ...form, activo: e.target.checked })}
              />{' '}
              Cuenta activa (puede iniciar sesión)
            </label>
          </div>
        )}
        {propio && (
          <Aviso tipo="info">
            <p>
              Es tu propia cuenta: no puedes cambiar tus roles ni desactivarla. Pídeselo a otra
              persona administradora.
            </p>
          </Aviso>
        )}
      </section>
      <section className="tarjeta pagina-media">
        <SelectorDeRoles
          roles={roles}
          elegidos={form.roles}
          deshabilitado={propio}
          error={errores.roles}
          onCambio={(nombre, elegido) =>
            setForm({ ...form, roles: alternarRol(form.roles, nombre, elegido) })
          }
        />
      </section>
      {Boolean(error) && <AvisoError error={error} />}
      <div className="acciones-formulario">
        <Boton type="submit" cargando={enviando} textoCargando="Guardando...">
          {props.modo === 'crear' ? 'Crear usuario' : 'Guardar cambios'}
        </Boton>
        <Link className="boton boton--secundario" to="/usuarios">
          Cancelar
        </Link>
      </div>
    </form>
  )
}
