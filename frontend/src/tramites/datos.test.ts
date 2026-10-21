import { describe, expect, it } from 'vitest'
import { ErrorApi } from '../api/errores'
import { CAMPOS } from '../test/datos'
import { aDatos, erroresDeDatos, erroresSinCampo, valoresIniciales } from './datos'

describe('valoresIniciales', () => {
  it('para un trámite nuevo deja los campos vacíos y las casillas sin marcar', () => {
    expect(valoresIniciales(CAMPOS)).toEqual({
      dpi: '',
      ingreso: '',
      nacimiento: '',
      casado: false,
    })
  })

  it('al editar parte de lo guardado, con los números como texto', () => {
    const valores = valoresIniciales(CAMPOS, {
      dpi: '1234567890123',
      ingreso: 3500.5,
      nacimiento: '1990-03-05',
      casado: true,
    })

    expect(valores).toEqual({
      dpi: '1234567890123',
      ingreso: '3500.5',
      nacimiento: '1990-03-05',
      casado: true,
    })
  })
})

describe('aDatos', () => {
  const vacios = { dpi: '', ingreso: '', nacimiento: '', casado: false }

  it('omite los campos vacíos (un borrador puede estar incompleto) pero siempre manda las casillas', () => {
    const { datos, errores } = aDatos(CAMPOS, vacios)

    expect(datos).toEqual({ casado: false })
    expect(errores).toEqual({})
  })

  it('recorta los espacios del texto y omite lo que solo tiene espacios', () => {
    const { datos } = aDatos(CAMPOS, { ...vacios, dpi: '  1234567890123  ', nacimiento: '   ' })

    expect(datos.dpi).toBe('1234567890123')
    expect(datos).not.toHaveProperty('nacimiento')
  })

  it.each([
    ['3500', 3500],
    ['3500.5', 3500.5],
    ['3500,5', 3500.5],
    ['3500.50', 3500.5],
    [' 12 ', 12],
    ['0', 0],
    ['-5', -5],
  ])('convierte el número "%s" en %d', (texto, esperado) => {
    const { datos, errores } = aDatos(CAMPOS, { ...vacios, ingreso: texto })

    expect(datos.ingreso).toBe(esperado)
    expect(errores).toEqual({})
  })

  it.each(['abc', '1.234', '1,2,3', '12a', '1e5', '--5', '.5', '5.'])(
    'rechaza el número mal escrito "%s" y no lo manda',
    (texto) => {
      const { datos, errores } = aDatos(CAMPOS, { ...vacios, ingreso: texto })

      expect(errores.ingreso).toContain('Escribe un número')
      expect(datos).not.toHaveProperty('ingreso')
    },
  )

  it('manda la casilla marcada como verdadero', () => {
    expect(aDatos(CAMPOS, { ...vacios, casado: true }).datos.casado).toBe(true)
  })

  it('manda las fechas como texto AAAA-MM-DD sin tocarlas', () => {
    expect(aDatos(CAMPOS, { ...vacios, nacimiento: '1990-03-05' }).datos.nacimiento).toBe(
      '1990-03-05',
    )
  })
})

describe('errores de la API por campo', () => {
  const error = new ErrorApi(400, 'Inválido', [
    { campo: 'datos.dpi', motivo: 'No cumple el formato esperado' },
    { campo: 'datos.ingreso', motivo: 'Debe ser mayor o igual a 0' },
  ])

  it('los devuelve por la clave del campo, sin el prefijo "datos."', () => {
    expect(erroresDeDatos(error)).toEqual({
      dpi: 'No cumple el formato esperado',
      ingreso: 'Debe ser mayor o igual a 0',
    })
  })

  it('ignora lo que no es un campo de datos y los errores que no son de la API', () => {
    expect(
      erroresDeDatos(new ErrorApi(400, 'x', [{ campo: 'tipoId', motivo: 'Obligatorio' }])),
    ).toEqual({})
    expect(erroresDeDatos(new Error('x'))).toEqual({})
  })

  it('erroresSinCampo avisa cuando hay algo que ningún campo del formulario muestra', () => {
    expect(erroresSinCampo(error, CAMPOS)).toBe(false)
    expect(erroresSinCampo(new ErrorApi(409, 'Conflicto'), CAMPOS)).toBe(true)
    expect(erroresSinCampo(new Error('x'), CAMPOS)).toBe(true)
    expect(
      erroresSinCampo(
        new ErrorApi(400, 'x', [
          { campo: 'datos.dpi', motivo: 'a' },
          { campo: 'tipoId', motivo: 'b' },
        ]),
        CAMPOS,
      ),
    ).toBe(true)
  })
})
