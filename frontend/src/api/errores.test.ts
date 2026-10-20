import { describe, expect, it } from 'vitest'
import { ErrorApi } from './errores'

function respuesta(estado: number, cuerpo?: unknown, cabeceras: Record<string, string> = {}) {
  return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json', ...cabeceras },
  })
}

describe('ErrorApi.desdeRespuesta', () => {
  it.each([
    [400, 'Revisa los datos'],
    [401, 'Sesión no válida'],
    [403, 'Sin permiso'],
    [404, 'No encontrado'],
    [409, 'No se pudo completar'],
    [429, 'Demasiados intentos'],
    [500, 'Error del servidor'],
    [503, 'Error del servidor'],
  ])('el estado %i lleva el título "%s"', async (estado, titulo) => {
    const error = await ErrorApi.desdeRespuesta(respuesta(estado, { detail: 'x' }))

    expect(error.titulo).toBe(titulo)
    expect(error.estado).toBe(estado)
  })

  it.each([400, 403, 404, 409])('en un %i usa el detalle que da la API', async (estado) => {
    const error = await ErrorApi.desdeRespuesta(respuesta(estado, { detail: 'Mensaje de la API' }))

    expect(error.message).toBe('Mensaje de la API')
  })

  it.each([500, 502, 503])(
    'en un %i NUNCA muestra el detalle del servidor ni de un proxy',
    async (estado) => {
      const error = await ErrorApi.desdeRespuesta(
        respuesta(estado, {
          detail: 'java.lang.NullPointerException at com.proyecto.tramites.PagoService:42',
          errores: [{ campo: 'tabla_interna', motivo: 'SQL: SELECT * FROM usuario' }],
        }),
      )

      expect(error.message).not.toMatch(/NullPointer|PagoService|SELECT/)
      expect(error.message).toContain('error inesperado')
      expect(error.errores).toEqual([])
    },
  )

  it('un 5xx con una página HTML de error del proxy tampoco filtra nada', async () => {
    const error = await ErrorApi.desdeRespuesta(
      new Response('<html><body>nginx/1.24 Bad Gateway</body></html>', { status: 502 }),
    )

    expect(error.message).not.toContain('nginx')
    expect(error.titulo).toBe('Error del servidor')
  })

  it('en un 429 usa los segundos de Retry-After', async () => {
    const error = await ErrorApi.desdeRespuesta(respuesta(429, {}, { 'Retry-After': '30' }))

    expect(error.esperarSegundos).toBe(30)
    expect(error.message).toBe('Demasiados intentos. Espera 30 segundos e intenta de nuevo.')
  })

  it.each(['', 'pronto', '-5', '0', 'Wed, 21 Oct 2026 07:28:00 GMT', '99999999'])(
    'ignora un Retry-After que no es un número razonable de segundos (%s)',
    async (valor) => {
      const error = await ErrorApi.desdeRespuesta(respuesta(429, {}, { 'Retry-After': valor }))

      expect(error.esperarSegundos).toBeUndefined()
      expect(error.message).toBe('Demasiados intentos. Espera un momento e intenta de nuevo.')
    },
  )

  it('conserva los errores por campo en un 400', async () => {
    const error = await ErrorApi.desdeRespuesta(
      respuesta(400, {
        detail: 'Inválido',
        errores: [{ campo: 'correo', motivo: 'Formato inválido' }],
      }),
    )

    expect(error.errores).toEqual([{ campo: 'correo', motivo: 'Formato inválido' }])
  })

  it('sin conexión tiene su título y mensaje', () => {
    const error = ErrorApi.sinConexion()

    expect(error.estado).toBe(0)
    expect(error.titulo).toBe('Sin conexión')
    expect(error.message).toContain('No se pudo conectar')
  })
})
