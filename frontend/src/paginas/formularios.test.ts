import { describe, expect, it } from 'vitest'
import { ErrorApi } from '../api/errores'
import { mensajeDeError, motivoDeCampo, rutaInternaSegura } from './formularios'

describe('rutaInternaSegura', () => {
  it.each(['/panel', '/tramites/12?estado=ENVIADO', '/'])('acepta la ruta interna %s', (ruta) => {
    expect(rutaInternaSegura(ruta, '/panel')).toBe(ruta)
  })

  it.each([
    '//sitio-ajeno.example',
    'https://sitio-ajeno.example',
    'javascript:alert(1)',
    '/\\sitio-ajeno.example',
    '/con espacio',
    '',
    null,
    undefined,
    42,
  ])('rechaza %s y usa el respaldo', (ruta) => {
    expect(rutaInternaSegura(ruta, '/panel')).toBe('/panel')
  })
})

describe('mensajeDeError y motivoDeCampo', () => {
  it('usa el mensaje de un ErrorApi', () => {
    expect(mensajeDeError(new ErrorApi(409, 'Ya existe'))).toBe('Ya existe')
  })

  it('con cualquier otro error usa un mensaje genérico sin filtrar el original', () => {
    const mensaje = mensajeDeError(new Error('stack interno'))
    expect(mensaje).toContain('error inesperado')
    expect(mensaje).not.toContain('stack interno')
  })

  it('encuentra el motivo de un campo y devuelve undefined si no hay', () => {
    const error = new ErrorApi(400, 'x', [{ campo: 'correo', motivo: 'Formato inválido' }])
    expect(motivoDeCampo(error, 'correo')).toBe('Formato inválido')
    expect(motivoDeCampo(error, 'clave')).toBeUndefined()
    expect(motivoDeCampo(new Error('x'), 'correo')).toBeUndefined()
  })
})
