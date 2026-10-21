import { render } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { configurarRenovador } from '../api/cliente'
import { guardarToken } from '../api/token'
import type { Perfil } from '../api/tipos'
import { guardarRenovacion } from '../sesion/almacen'
import { ProveedorSesion } from '../sesion/ProveedorSesion'
import { json, simularApi, tokens, type Llamada, type Manejador } from './api-simulada'

/** Renderiza la aplicación completa en StrictMode, como en desarrollo, empezando en la ruta indicada. */
export function renderizarApp(ruta = '/') {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[ruta]}>
        <ProveedorSesion>
          <App />
        </ProveedorSesion>
      </MemoryRouter>
    </StrictMode>,
  )
}

/**
 * Simula una persona con sesión iniciada: hay un token de renovación guardado y la API la reconoce con ese perfil.
 * Las rutas que se pasan se suman a la API simulada. Devuelve la lista de llamadas hechas.
 */
export function simularSesion(perfil: Perfil, rutas: Record<string, Manejador> = {}): Llamada[] {
  guardarRenovacion('renovacion-guardada')
  return simularApi({
    'POST /api/auth/refresh': () => json(tokens('1')),
    'GET /api/usuarios/yo': () => json(perfil),
    ...rutas,
  })
}

/** Deja el navegador simulado sin sesión: sin tokens guardados ni renovador registrado. */
export function limpiarSesion(): void {
  sessionStorage.clear()
  localStorage.clear()
  guardarToken(null)
  configurarRenovador(null)
}
