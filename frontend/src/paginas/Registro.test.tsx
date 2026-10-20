import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { json, problema, simularApi } from '../test/api-simulada'
import { limpiarSesion, renderizarApp } from '../test/utilidades'

beforeEach(() => {
  limpiarSesion()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function llenar(usuario: ReturnType<typeof userEvent.setup>, clave = 'clave-segura-123') {
  await usuario.type(await screen.findByLabelText('Nombre completo'), 'Ana López')
  await usuario.type(screen.getByLabelText('Correo'), 'ana@demo.com')
  await usuario.type(screen.getByLabelText(/Contraseña/), clave)
}

describe('registro', () => {
  it('crea la cuenta y lleva al inicio de sesión con un aviso', async () => {
    const llamadas = simularApi({
      'POST /api/auth/registro': () =>
        json({ id: 9, correo: 'ana@demo.com', nombre: 'Ana López', roles: ['CIUDADANO'] }, 201),
    })
    const usuario = userEvent.setup()
    renderizarApp('/registro')

    await llenar(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Tu cuenta fue creada')
    expect(llamadas[0].cuerpo).toEqual({
      nombre: 'Ana López',
      correo: 'ana@demo.com',
      clave: 'clave-segura-123',
    })
    expect(llamadas[0].cabeceras.Authorization).toBeUndefined()
  })

  it('muestra junto a cada campo el motivo que dio el servidor', async () => {
    simularApi({
      'POST /api/auth/registro': () =>
        problema(400, 'La solicitud tiene campos invalidos', [
          { campo: 'correo', motivo: 'debe ser una dirección de correo electrónico bien formada' },
        ]),
    })
    const usuario = userEvent.setup()
    renderizarApp('/registro')

    await llenar(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(await screen.findByText(/bien formada/)).toBeInTheDocument()
    expect(screen.getByLabelText('Correo')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Nombre completo')).toHaveAttribute('aria-invalid', 'false')
  })

  it('con un correo ya registrado muestra el aviso del servidor y vacía la clave', async () => {
    simularApi({ 'POST /api/auth/registro': () => problema(409, 'El correo ya esta registrado') })
    const usuario = userEvent.setup()
    renderizarApp('/registro')

    await llenar(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('El correo ya esta registrado')
    expect(screen.getByLabelText(/Contraseña/)).toHaveValue('')
  })

  it('no deja enviar con una contraseña de menos de 8 caracteres', async () => {
    simularApi({})
    const usuario = userEvent.setup()
    renderizarApp('/registro')

    await llenar(usuario, 'corta')

    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeDisabled()
  })

  it('si el servidor no responde avisa sin mostrar detalles técnicos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const usuario = userEvent.setup()
    renderizarApp('/registro')

    await llenar(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('No se pudo conectar con el servidor')
    expect(alerta).not.toHaveTextContent('Failed to fetch')
  })
})
