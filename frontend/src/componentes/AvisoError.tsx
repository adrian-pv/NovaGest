import { ErrorApi } from '../api/errores'
import Aviso from './Aviso'

interface Props {
  error: unknown
  /** Reemplaza el título según el estado HTTP (por ejemplo "No se pudo iniciar sesión"). */
  titulo?: string
  /** Si es falso no se listan los campos inválidos (la pantalla ya los muestra junto a cada campo). */
  mostrarCampos?: boolean
}

/**
 * Muestra cualquier error de una llamada a la API de forma uniforme. Con un ErrorApi usa su título y mensaje, que
 * ya vienen sin detalles internos; con cualquier otra cosa (un fallo del propio código) usa un texto general y nunca
 * el mensaje original.
 */
export default function AvisoError({ error, titulo, mostrarCampos = true }: Props) {
  if (!(error instanceof ErrorApi)) {
    return (
      <Aviso tipo="error" titulo={titulo ?? 'Algo salió mal'}>
        <p>Ocurrió un error inesperado. Intenta de nuevo.</p>
      </Aviso>
    )
  }
  const campos = mostrarCampos ? error.errores : []
  return (
    <Aviso tipo="error" titulo={titulo ?? error.titulo}>
      <p>{error.message}</p>
      {campos.length > 0 && (
        <ul>
          {campos.map((c) => (
            <li key={`${c.campo}-${c.motivo}`}>
              <strong>{c.campo}:</strong> {c.motivo}
            </li>
          ))}
        </ul>
      )}
    </Aviso>
  )
}
