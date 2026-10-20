import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

function abrir(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <App />
    </MemoryRouter>,
  )
}

const fetchSimulado = vi.fn()

beforeEach(() => {
  fetchSimulado.mockReset()
  vi.stubGlobal('fetch', fetchSimulado)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('muestra que el servidor está disponible cuando la salud responde UP', async () => {
    fetchSimulado.mockResolvedValue(
      new Response(JSON.stringify({ status: 'UP' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    abrir('/')

    expect(await screen.findByText('Servidor disponible')).toBeInTheDocument()
    expect(fetchSimulado).toHaveBeenCalledWith(
      '/actuator/health',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('avisa cuando no se puede conectar con el servidor', async () => {
    fetchSimulado.mockRejectedValue(new TypeError('Failed to fetch'))

    abrir('/')

    expect(await screen.findByText('No se pudo conectar con el servidor')).toBeInTheDocument()
  })

  it('muestra la página de no encontrado en una ruta desconocida', () => {
    abrir('/ruta-que-no-existe')

    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/')
  })
})
