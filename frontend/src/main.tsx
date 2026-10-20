import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import LimiteDeError from './componentes/LimiteDeError'
import './index.css'
import { ProveedorSesion } from './sesion/ProveedorSesion'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LimiteDeError>
      <BrowserRouter>
        <ProveedorSesion>
          <App />
        </ProveedorSesion>
      </BrowserRouter>
    </LimiteDeError>
  </StrictMode>,
)
