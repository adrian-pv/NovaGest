import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { solicitar } from './cliente'
import { ErrorApi } from './errores'
import { guardarToken } from './token'

const fetchSimulado = vi.fn()

function json(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json' },
  })
}

function ultimaLlamada() {
  const [url, init] = fetchSimulado.mock.calls.at(-1) as [string, RequestInit]
  return { url, init, cabeceras: init.headers as Record<string, string> }
}

beforeEach(() => {
  fetchSimulado.mockReset()
  vi.stubGlobal('fetch', fetchSimulado)
  guardarToken(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('solicitar', () => {
  it('envía el token de acceso en la cabecera Authorization', async () => {
    guardarToken('token-de-prueba')
    fetchSimulado.mockResolvedValue(json({ ok: true }))

    await solicitar('/api/tramites')

    expect(ultimaLlamada().cabeceras.Authorization).toBe('Bearer token-de-prueba')
  })

  it('no envía el token en rutas públicas', async () => {
    guardarToken('token-de-prueba')
    fetchSimulado.mockResolvedValue(json({ status: 'UP' }))

    await solicitar('/actuator/health', { sinToken: true })

    expect(ultimaLlamada().cabeceras.Authorization).toBeUndefined()
  })

  it('sin sesión no manda la cabecera Authorization', async () => {
    fetchSimulado.mockResolvedValue(json({}))

    await solicitar('/api/tramites')

    expect(ultimaLlamada().cabeceras.Authorization).toBeUndefined()
  })

  it('serializa el cuerpo como JSON y usa el método pedido', async () => {
    fetchSimulado.mockResolvedValue(json({ id: 1 }, 201))

    await solicitar('/api/tramites', { metodo: 'POST', cuerpo: { tipoId: 3 } })

    const { init, cabeceras } = ultimaLlamada()
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"tipoId":3}')
    expect(cabeceras['Content-Type']).toBe('application/json')
  })

  it('envía formularios multipart sin fijar el Content-Type', async () => {
    fetchSimulado.mockResolvedValue(json({}, 201))
    const formulario = new FormData()
    formulario.append('comprobante', new Blob(['x']), 'recibo.pdf')

    await solicitar('/api/tramites/1/pagos', { metodo: 'POST', formulario })

    const { init, cabeceras } = ultimaLlamada()
    expect(init.body).toBe(formulario)
    expect(cabeceras['Content-Type']).toBeUndefined()
  })

  it('arma la consulta e ignora los parámetros vacíos', async () => {
    fetchSimulado.mockResolvedValue(json({}))

    await solicitar('/api/tramites', {
      consulta: { estado: 'ENVIADO', page: 0, tipoId: undefined, desde: '', nulo: null },
    })

    expect(ultimaLlamada().url).toBe('/api/tramites?estado=ENVIADO&page=0')
  })

  it('responde undefined cuando la API contesta 204', async () => {
    fetchSimulado.mockResolvedValue(new Response(null, { status: 204 }))

    await expect(solicitar('/api/tramites/1', { metodo: 'DELETE' })).resolves.toBeUndefined()
  })

  it('convierte un Problem Details en ErrorApi con sus errores de campo', async () => {
    fetchSimulado.mockResolvedValue(
      json(
        {
          title: 'Solicitud inválida',
          detail: 'La solicitud tiene campos inválidos',
          status: 400,
          errores: [{ campo: 'correo', motivo: 'Formato inválido' }],
        },
        400,
      ),
    )

    const error = await solicitar('/api/auth/registro', { metodo: 'POST', cuerpo: {} }).catch(
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(ErrorApi)
    const errorApi = error as ErrorApi
    expect(errorApi.estado).toBe(400)
    expect(errorApi.message).toBe('La solicitud tiene campos inválidos')
    expect(errorApi.errores).toEqual([{ campo: 'correo', motivo: 'Formato inválido' }])
  })

  it('usa un mensaje por estado cuando el cuerpo no es Problem Details', async () => {
    fetchSimulado.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 403 }))

    const error = (await solicitar('/api/bitacora').catch((e: unknown) => e)) as ErrorApi

    expect(error.estado).toBe(403)
    expect(error.message).toBe('No tienes permiso para hacer esto.')
    expect(error.errores).toEqual([])
  })

  it('traduce el 429 a un mensaje de espera', async () => {
    fetchSimulado.mockResolvedValue(new Response(null, { status: 429 }))

    const error = (await solicitar('/api/auth/login').catch((e: unknown) => e)) as ErrorApi

    expect(error.estado).toBe(429)
    expect(error.message).toContain('Demasiados intentos')
  })

  it('traduce una red caída a un ErrorApi de estado 0 sin filtrar detalles técnicos', async () => {
    fetchSimulado.mockRejectedValue(new TypeError('Failed to fetch'))

    const error = (await solicitar('/api/tramites').catch((e: unknown) => e)) as ErrorApi

    expect(error).toBeInstanceOf(ErrorApi)
    expect(error.estado).toBe(0)
    expect(error.message).not.toContain('Failed to fetch')
  })

  it('deja pasar la cancelación sin convertirla en error de red', async () => {
    fetchSimulado.mockRejectedValue(new DOMException('cancelado', 'AbortError'))

    const error = await solicitar('/api/tramites').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(DOMException)
  })
})

describe('token', () => {
  it('no se guarda en el almacenamiento del navegador', () => {
    guardarToken('token-secreto-de-prueba')

    const todo = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage })
    expect(todo).not.toContain('token-secreto-de-prueba')
  })
})
