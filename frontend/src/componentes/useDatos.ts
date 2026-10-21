import { useCallback, useEffect, useRef, useState } from 'react'

interface Resultado<T> {
  /** A qué petición (clave y versión) pertenece este resultado. */
  peticion: string
  datos?: T
  error?: unknown
}

/**
 * Carga datos de la API para una pantalla y los vuelve a cargar cuando cambia `clave` o se llama a `recargar`.
 * Cancela la petición anterior si la pantalla cambia o se cierra, para que una respuesta lenta no pise a una nueva.
 * `clave` debe resumir todo lo que cambia el resultado (por ejemplo "12" o "ENVIADO|2"); `cargar` puede cambiar en
 * cada render sin provocar recargas. Mientras llega una petición nueva se siguen mostrando los datos anteriores.
 */
export function useDatos<T>(clave: string, cargar: (senal: AbortSignal) => Promise<T>) {
  const [version, setVersion] = useState(0)
  const [resultado, setResultado] = useState<Resultado<T> | null>(null)
  const ultimaCarga = useRef(cargar)
  const peticion = `${clave}#${version}`

  useEffect(() => {
    ultimaCarga.current = cargar
  })

  useEffect(() => {
    const control = new AbortController()
    ultimaCarga
      .current(control.signal)
      .then((datos) => setResultado({ peticion, datos }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setResultado({ peticion, error })
      })
    return () => control.abort()
  }, [peticion])

  const recargar = useCallback(() => setVersion((v) => v + 1), [])
  const alDia = resultado?.peticion === peticion
  return {
    datos: resultado?.datos,
    error: alDia ? resultado.error : undefined,
    cargando: !alDia,
    recargar,
  }
}
