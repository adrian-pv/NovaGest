import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configurarRenovador, solicitar } from './cliente'
import { ErrorApi } from './errores'
import { guardarToken, leerToken, tokenVencido } from './token'
import { json, problema, simularApi } from '../test/api-simulada'

beforeEach(() => {
  guardarToken('acceso-viejo')
  configurarRenovador(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
  guardarToken(null)
  configurarRenovador(null)
})

describe('solicitar: renovación de la sesión al recibir 401', () => {
  it('renueva y reintenta una vez con el token nuevo', async () => {
    let intentos = 0
    const llamadas = simularApi({
      'GET /api/tramites': () =>
        ++intentos === 1 ? problema(401, 'Token vencido') : json({ ok: true }),
    })
    configurarRenovador(async () => {
      guardarToken('acceso-nuevo')
      return true
    })

    await expect(solicitar('/api/tramites')).resolves.toEqual({ ok: true })

    expect(llamadas).toHaveLength(2)
    expect(llamadas[0].cabeceras.Authorization).toBe('Bearer acceso-viejo')
    expect(llamadas[1].cabeceras.Authorization).toBe('Bearer acceso-nuevo')
  })

  it('si no se logra renovar, devuelve el 401 original y no reintenta', async () => {
    const llamadas = simularApi({ 'GET /api/tramites': () => problema(401, 'Token vencido') })
    configurarRenovador(async () => false)

    const error = (await solicitar('/api/tramites').catch((e: unknown) => e)) as ErrorApi

    expect(error.estado).toBe(401)
    expect(llamadas).toHaveLength(1)
  })

  it('reintenta solo una vez aunque el segundo intento también dé 401', async () => {
    const llamadas = simularApi({ 'GET /api/tramites': () => problema(401, 'Token inválido') })
    const renovador = vi.fn(async () => true)
    configurarRenovador(renovador)

    const error = (await solicitar('/api/tramites').catch((e: unknown) => e)) as ErrorApi

    expect(error.estado).toBe(401)
    expect(llamadas).toHaveLength(2)
    expect(renovador).toHaveBeenCalledTimes(1)
  })

  it('no intenta renovar en rutas públicas: un login con clave mala no es una sesión vencida', async () => {
    simularApi({ 'POST /api/auth/login': () => problema(401, 'Credenciales invalidas') })
    const renovador = vi.fn(async () => true)
    configurarRenovador(renovador)

    const error = (await solicitar('/api/auth/login', {
      metodo: 'POST',
      cuerpo: {},
      sinToken: true,
    }).catch((e: unknown) => e)) as ErrorApi

    expect(error.estado).toBe(401)
    expect(renovador).not.toHaveBeenCalled()
  })

  it('no renueva ante otros errores como 403 o 500', async () => {
    simularApi({
      'GET /api/bitacora': () => problema(403, 'Sin permiso'),
      'GET /api/tramites': () => problema(500, 'Error'),
    })
    const renovador = vi.fn(async () => true)
    configurarRenovador(renovador)

    await solicitar('/api/bitacora').catch(() => undefined)
    await solicitar('/api/tramites').catch(() => undefined)

    expect(renovador).not.toHaveBeenCalled()
  })

  it('sin renovador registrado, el 401 llega tal cual', async () => {
    simularApi({ 'GET /api/tramites': () => problema(401, 'Token vencido') })

    const error = (await solicitar('/api/tramites').catch((e: unknown) => e)) as ErrorApi

    expect(error.estado).toBe(401)
  })
})

describe('token en memoria', () => {
  it('sabe cuándo está por vencer, con un margen', () => {
    guardarToken('t', 900)
    expect(tokenVencido()).toBe(false)

    guardarToken('t', 10)
    expect(tokenVencido()).toBe(true)
  })

  it('sin dato de vencimiento no se declara vencido', () => {
    guardarToken('t')
    expect(tokenVencido()).toBe(false)
  })

  it('al guardar null se descarta el token', () => {
    guardarToken(null)
    expect(leerToken()).toBeNull()
    expect(tokenVencido()).toBe(false)
  })
})
