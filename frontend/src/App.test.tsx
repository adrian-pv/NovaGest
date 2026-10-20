import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { json, simularApi } from './test/api-simulada'
import { limpiarSesion, renderizarApp } from './test/utilidades'

beforeEach(() => {
  limpiarSesion()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('muestra que el servidor está disponible cuando la salud responde UP', async () => {
    const llamadas = simularApi({ 'GET /actuator/health': () => json({ status: 'UP' }) })

    renderizarApp('/')

    expect(await screen.findByText('Servidor disponible')).toBeInTheDocument()
    expect(llamadas.some((l) => l.ruta === '/actuator/health')).toBe(true)
  })

  it('avisa cuando no se puede conectar con el servidor', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    renderizarApp('/')

    expect(await screen.findByText('No se pudo conectar con el servidor')).toBeInTheDocument()
  })

  it('ofrece iniciar sesión y crear cuenta a quien no ha entrado', async () => {
    simularApi({ 'GET /actuator/health': () => json({ status: 'UP' }) })

    renderizarApp('/')

    // Los enlaces están en la cabecera y en el contenido principal; aquí se mira el contenido
    const principal = within(await screen.findByRole('main'))
    expect(await principal.findByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute(
      'href',
      '/ingresar',
    )
    expect(principal.getByRole('link', { name: 'Crear cuenta' })).toHaveAttribute(
      'href',
      '/registro',
    )
  })

  it('pone el título de la pestaña según la pantalla', async () => {
    simularApi({})

    renderizarApp('/registro')

    await screen.findByRole('heading', { name: 'Crear cuenta' })
    expect(document.title).toBe('Crear cuenta · NovaGest')
  })

  it('muestra la página de no encontrado en una ruta desconocida', async () => {
    simularApi({})

    renderizarApp('/ruta-que-no-existe')

    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/')
  })
})
