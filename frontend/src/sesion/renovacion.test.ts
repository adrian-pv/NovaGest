import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { leerToken } from '../api/token'
import { json, problema, simularApi, tokens } from '../test/api-simulada'
import { limpiarSesion } from '../test/utilidades'
import { guardarRenovacion, leerRenovacion } from './almacen'
import { alExpirarSesion, renovarSesion } from './renovacion'

beforeEach(() => {
  limpiarSesion()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('renovarSesion', () => {
  it('guarda el par nuevo: el de acceso en memoria y el de renovación en la pestaña', async () => {
    guardarRenovacion('renovacion-vieja')
    simularApi({ 'POST /api/auth/refresh': () => json(tokens('nuevo')) })

    await expect(renovarSesion()).resolves.toBe(true)

    expect(leerToken()).toBe('acceso-nuevo')
    expect(leerRenovacion()).toBe('renovacion-nuevo')
  })

  it('envía el token de renovación vigente en el cuerpo y no manda Authorization', async () => {
    guardarRenovacion('renovacion-vieja')
    const llamadas = simularApi({ 'POST /api/auth/refresh': () => json(tokens('nuevo')) })

    await renovarSesion()

    expect(llamadas[0].cuerpo).toEqual({ refreshToken: 'renovacion-vieja' })
    expect(llamadas[0].cabeceras.Authorization).toBeUndefined()
  })

  it('varias llamadas a la vez comparten UNA sola renovación (el token es de un solo uso)', async () => {
    guardarRenovacion('renovacion-vieja')
    const llamadas = simularApi({ 'POST /api/auth/refresh': () => json(tokens('nuevo')) })

    const resultados = await Promise.all([renovarSesion(), renovarSesion(), renovarSesion()])

    expect(resultados).toEqual([true, true, true])
    expect(llamadas.filter((l) => l.ruta === '/api/auth/refresh')).toHaveLength(1)
  })

  it('terminada una renovación, la siguiente vuelve a pedir al servidor con el token nuevo', async () => {
    guardarRenovacion('renovacion-1')
    let n = 1
    const llamadas = simularApi({ 'POST /api/auth/refresh': () => json(tokens(String(++n))) })

    await renovarSesion()
    await renovarSesion()

    expect(llamadas).toHaveLength(2)
    expect(llamadas[0].cuerpo).toEqual({ refreshToken: 'renovacion-1' })
    expect(llamadas[1].cuerpo).toEqual({ refreshToken: 'renovacion-2' })
  })

  it('sin token de renovación guardado no llama al servidor', async () => {
    const llamadas = simularApi({})

    await expect(renovarSesion()).resolves.toBe(false)

    expect(llamadas).toHaveLength(0)
  })

  it('si el servidor lo rechaza, olvida la sesión y avisa que expiró', async () => {
    guardarRenovacion('renovacion-usada')
    simularApi({ 'POST /api/auth/refresh': () => problema(401, 'Token de renovacion invalido') })
    const aviso = vi.fn()
    const quitar = alExpirarSesion(aviso)

    await expect(renovarSesion()).resolves.toBe(false)
    quitar()

    expect(leerRenovacion()).toBeNull()
    expect(leerToken()).toBeNull()
    expect(aviso).toHaveBeenCalledTimes(1)
  })

  it('sin conexión conserva el token de renovación y no da la sesión por terminada', async () => {
    guardarRenovacion('renovacion-vieja')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const aviso = vi.fn()
    const quitar = alExpirarSesion(aviso)

    await expect(renovarSesion()).resolves.toBe(false)
    quitar()

    expect(leerRenovacion()).toBe('renovacion-vieja')
    expect(aviso).not.toHaveBeenCalled()
  })

  it('tras quitar el oyente ya no recibe avisos', async () => {
    guardarRenovacion('renovacion-usada')
    simularApi({ 'POST /api/auth/refresh': () => problema(401, 'invalido') })
    const aviso = vi.fn()
    alExpirarSesion(aviso)()

    await renovarSesion()

    expect(aviso).not.toHaveBeenCalled()
  })
})
