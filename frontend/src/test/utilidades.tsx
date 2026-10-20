import { render } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { configurarRenovador } from '../api/cliente'
import { guardarToken } from '../api/token'
import { ProveedorSesion } from '../sesion/ProveedorSesion'

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

/** Deja el navegador simulado sin sesión: sin tokens guardados ni renovador registrado. */
export function limpiarSesion(): void {
  sessionStorage.clear()
  localStorage.clear()
  guardarToken(null)
  configurarRenovador(null)
}
