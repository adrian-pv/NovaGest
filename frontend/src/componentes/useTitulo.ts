import { useEffect } from 'react'

/** Pone el título de la pestaña ("Mis trámites · NovaGest"); sirve para ubicarse y para lectores de pantalla. */
export function useTitulo(titulo?: string): void {
  useEffect(() => {
    document.title = titulo ? `${titulo} · NovaGest` : 'NovaGest'
  }, [titulo])
}
