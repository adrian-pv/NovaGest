import { useTitulo } from '../componentes/useTitulo'
import Insignia from '../componentes/Insignia'
import { capacidadesDe } from '../sesion/capacidades'
import { useSesion } from '../sesion/contexto'

/** Pantalla de entrada tras iniciar sesión. Los accesos a cada flujo se agregan con las tarjetas 33 a 40. */
export default function Panel() {
  const { perfil } = useSesion()
  useTitulo('Mi panel')
  if (!perfil) return null
  const capacidades = capacidadesDe(perfil)

  return (
    <>
      <div className="encabezado-pagina">
        <h1>Hola, {perfil.nombre}</h1>
        <p>
          Entraste como <Insignia>{perfil.roles.join(', ')}</Insignia>{' '}
          {perfil.alcanceTotal
            ? 'y ves los trámites de todas las personas.'
            : 'y ves solo tus trámites.'}
        </p>
      </div>
      <section className="tarjeta" aria-labelledby="titulo-capacidades">
        <h2 id="titulo-capacidades">Lo que puedes hacer</h2>
        {capacidades.length > 0 ? (
          <ul className="lista-capacidades">
            {capacidades.map((texto) => (
              <li key={texto}>{texto}</li>
            ))}
          </ul>
        ) : (
          <p>Tu rol todavía no tiene acciones habilitadas. Consulta con un administrador.</p>
        )}
      </section>
    </>
  )
}
