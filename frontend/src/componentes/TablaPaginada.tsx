import type { ReactNode } from 'react'
import type { Pagina } from '../api/tipos'
import AvisoError from './AvisoError'
import Boton from './Boton'
import Cargando from './Cargando'

export interface Columna<T> {
  clave: string
  encabezado: string
  celda: (fila: T) => ReactNode
  /** Alinea números y montos a la derecha. */
  derecha?: boolean
}

interface Props<T> {
  /** Describe la tabla a lectores de pantalla (no se ve). */
  titulo: string
  columnas: Columna<T>[]
  /** Respuesta paginada de la API (Page de Spring Data). Sin ella todavía no hay datos que mostrar. */
  pagina?: Pagina<T>
  cargando?: boolean
  error?: unknown
  onReintentar?: () => void
  /** Recibe el número de página a pedir, empezando en 0 como la API. */
  onCambiarPagina: (pagina: number) => void
  idFila: (fila: T) => string | number
  mensajeVacio?: string
}

/**
 * Tabla con paginación del servidor, lista para cualquier listado de la API. Cubre los cuatro estados que toda
 * pantalla de listado necesita: cargando, error (con "Reintentar"), vacío y con datos.
 */
export default function TablaPaginada<T>({
  titulo,
  columnas,
  pagina,
  cargando = false,
  error,
  onReintentar,
  onCambiarPagina,
  idFila,
  mensajeVacio = 'No hay registros para mostrar.',
}: Props<T>) {
  if (error) {
    return (
      <div>
        <AvisoError error={error} />
        {onReintentar && (
          <Boton variante="secundario" onClick={onReintentar}>
            Reintentar
          </Boton>
        )}
      </div>
    )
  }
  if (!pagina) return <Cargando texto="Cargando datos..." />
  if (pagina.content.length === 0) return <p className="vacio">{mensajeVacio}</p>

  const desde = pagina.number * pagina.size + 1
  const hasta = desde + pagina.content.length - 1
  const hayAnterior = pagina.number > 0
  const haySiguiente = pagina.number + 1 < pagina.totalPages

  return (
    <div>
      <div className="tabla-contenedor" aria-busy={cargando}>
        <table className="tabla">
          <caption className="solo-lectores">{titulo}</caption>
          <thead>
            <tr>
              {columnas.map((c) => (
                <th key={c.clave} scope="col" className={c.derecha ? 'derecha' : undefined}>
                  {c.encabezado}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagina.content.map((fila) => (
              <tr key={idFila(fila)}>
                {columnas.map((c) => (
                  <td key={c.clave} className={c.derecha ? 'derecha' : undefined}>
                    {c.celda(fila)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav className="paginacion" aria-label="Paginación">
        <span className="paginacion__resumen">
          Mostrando {desde}–{hasta} de {pagina.totalElements}
        </span>
        <div className="paginacion__controles">
          <Boton
            variante="secundario"
            disabled={!hayAnterior || cargando}
            onClick={() => onCambiarPagina(pagina.number - 1)}
          >
            Anterior
          </Boton>
          <span>
            Página {pagina.number + 1} de {pagina.totalPages}
          </span>
          <Boton
            variante="secundario"
            disabled={!haySiguiente || cargando}
            onClick={() => onCambiarPagina(pagina.number + 1)}
          >
            Siguiente
          </Boton>
        </div>
      </nav>
    </div>
  )
}
