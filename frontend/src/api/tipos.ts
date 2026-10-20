/** Página de resultados de Spring Data, tal como la devuelve la API. */
export interface Pagina<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

export interface Salud {
  status: 'UP' | 'DOWN'
}
