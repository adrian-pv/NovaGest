import { describe, expect, it } from 'vitest'
import { ErrorApi } from '../api/errores'
import { CAMPOS, TIPO_ORNATO } from '../test/datos'
import {
  MAX_CAMPOS,
  desdeTipo,
  erroresDelServidor,
  formularioVacio,
  moverFila,
  nuevaFila,
  validar,
  type FormTipo,
} from './formulario'

function valido(extra: Partial<FormTipo> = {}): FormTipo {
  return { ...formularioVacio(), nombre: 'Licencia', monto: '10', ...extra }
}

function conCampo(extra: Parameters<typeof nuevaFila>[0]): FormTipo {
  return valido({ campos: [nuevaFila({ clave: 'dato', etiqueta: 'Un dato', ...extra })] })
}

describe('desdeTipo', () => {
  it('pasa a texto lo que viene de la API y ordena los campos por su orden', () => {
    const form = desdeTipo({
      ...TIPO_ORNATO,
      descripcion: null,
      monto: 25.5,
      campos: [CAMPOS[1], CAMPOS[0]],
    })

    expect(form.descripcion).toBe('')
    expect(form.monto).toBe('25.5')
    expect(form.campos.map((c) => c.clave)).toEqual(['dpi', 'ingreso'])
    expect(form.campos[0]).toMatchObject({ patron: '^[0-9]{13}$', minimo: '', obligatorio: true })
    expect(form.campos[1]).toMatchObject({ patron: '', minimo: '0', tipoDato: 'NUMERO' })
  })

  it('cada fila recibe su propio identificador', () => {
    const uids = desdeTipo(TIPO_ORNATO).campos.map((c) => c.uid)
    expect(new Set(uids).size).toBe(uids.length)
  })
})

describe('validar: nombre, descripción y monto', () => {
  it('un formulario vacío pide el nombre y no genera solicitud', () => {
    const resultado = validar({ ...formularioVacio(), monto: '' })

    expect(resultado.solicitud).toBeUndefined()
    expect(resultado.errores.nombre).toBeTruthy()
    expect(resultado.errores.monto).toBeTruthy()
  })

  it('el nombre y la descripción tienen el mismo límite que la API', () => {
    expect(validar(valido({ nombre: 'a'.repeat(100) })).solicitud).toBeDefined()
    expect(validar(valido({ nombre: 'a'.repeat(101) })).errores.nombre).toBeTruthy()
    expect(validar(valido({ nombre: '   ' })).errores.nombre).toBeTruthy()
    expect(validar(valido({ descripcion: 'a'.repeat(255) })).solicitud).toBeDefined()
    expect(validar(valido({ descripcion: 'a'.repeat(256) })).errores.descripcion).toBeTruthy()
  })

  it.each(['0', '25', '25.5', '25,50', ' 7 ', '999999999999.99'])('acepta el monto %j', (monto) => {
    expect(validar(valido({ monto })).errores.monto).toBeUndefined()
  })

  it.each(['-1', '1.234', 'abc', '1e3', '', '   ', '9999999999999', '1.', '.5', '1,2,3'])(
    'rechaza el monto %j',
    (monto) => {
      expect(validar(valido({ monto })).errores.monto).toBeTruthy()
    },
  )

  it('arma la solicitud con el monto como número, el texto sin espacios y la descripción vacía como null', () => {
    const { solicitud } = validar({
      nombre: '  Licencia de venta ',
      descripcion: '   ',
      monto: '12,5',
      activo: false,
      campos: [],
    })

    expect(solicitud).toEqual({
      nombre: 'Licencia de venta',
      descripcion: null,
      monto: 12.5,
      activo: false,
      campos: [],
    })
  })
})

describe('validar: campos', () => {
  it.each(['Mala', '1abc', 'a b', 'con-guion', '_x', 'ñandu', ''])(
    'rechaza la clave %j',
    (clave) => {
      const form = conCampo({ clave })
      expect(validar(form).errores.filas[form.campos[0].uid]?.clave).toBeTruthy()
    },
  )

  it.each(['a', 'ingreso_mensual', 'dpi2', 'a'.repeat(50)])('acepta la clave %j', (clave) => {
    expect(validar(conCampo({ clave })).solicitud).toBeDefined()
  })

  it('rechaza una clave de más de 50 caracteres', () => {
    const form = conCampo({ clave: 'a'.repeat(51) })
    expect(validar(form).errores.filas[form.campos[0].uid]?.clave).toBeTruthy()
  })

  it('marca como repetida solo la segunda clave igual', () => {
    const form = valido({
      campos: [
        nuevaFila({ clave: 'dpi', etiqueta: 'A' }),
        nuevaFila({ clave: 'dpi', etiqueta: 'B' }),
      ],
    })

    const { errores } = validar(form)

    expect(errores.filas[form.campos[0].uid]).toBeUndefined()
    expect(errores.filas[form.campos[1].uid]?.clave).toMatch(/otro campo/)
  })

  it('exige la etiqueta y la limita a 100 caracteres', () => {
    const vacia = conCampo({ etiqueta: '  ' })
    expect(validar(vacia).errores.filas[vacia.campos[0].uid]?.etiqueta).toBeTruthy()
    const larga = conCampo({ etiqueta: 'a'.repeat(101) })
    expect(validar(larga).errores.filas[larga.campos[0].uid]?.etiqueta).toBeTruthy()
    expect(validar(conCampo({ etiqueta: 'a'.repeat(100) })).solicitud).toBeDefined()
  })

  it('el mínimo de un campo numérico sigue las reglas del monto', () => {
    const malo = conCampo({ tipoDato: 'NUMERO', minimo: '-3' })
    expect(validar(malo).errores.filas[malo.campos[0].uid]?.minimo).toBeTruthy()
    expect(
      validar(conCampo({ tipoDato: 'NUMERO', minimo: '3,5' })).solicitud?.campos?.[0].minimo,
    ).toBe(3.5)
    expect(
      validar(conCampo({ tipoDato: 'NUMERO', minimo: '' })).solicitud?.campos?.[0].minimo,
    ).toBeNull()
  })

  it('el patrón solo se manda en campos de texto y el mínimo solo en los numéricos', () => {
    const texto = validar(conCampo({ tipoDato: 'TEXTO', patron: ' ^[0-9]+$ ', minimo: '5' }))
    expect(texto.solicitud?.campos?.[0]).toMatchObject({ patron: '^[0-9]+$', minimo: null })

    const numero = validar(conCampo({ tipoDato: 'NUMERO', patron: '^x$', minimo: '5' }))
    expect(numero.solicitud?.campos?.[0]).toMatchObject({ patron: null, minimo: 5 })

    const fecha = validar(conCampo({ tipoDato: 'FECHA', patron: '^x$', minimo: '5' }))
    expect(fecha.solicitud?.campos?.[0]).toMatchObject({ patron: null, minimo: null })
  })

  it('lo escrito en un campo oculto no provoca errores (un mínimo mal escrito en un campo de texto)', () => {
    expect(validar(conCampo({ tipoDato: 'TEXTO', minimo: 'abc' })).solicitud).toBeDefined()
    expect(
      validar(conCampo({ tipoDato: 'NUMERO', patron: 'a'.repeat(300) })).solicitud,
    ).toBeDefined()
  })

  it('no deja pasar más campos de los que acepta la API', () => {
    const campos = Array.from({ length: MAX_CAMPOS + 1 }, (_, i) =>
      nuevaFila({ clave: `c${i}`, etiqueta: `Campo ${i}` }),
    )
    const resultado = validar(valido({ campos }))
    expect(resultado.errores.campos).toBeTruthy()
    expect(resultado.solicitud).toBeUndefined()
    expect(validar(valido({ campos: campos.slice(0, MAX_CAMPOS) })).solicitud).toBeDefined()
  })

  it('manda los campos en el orden en que están en el formulario', () => {
    const form = valido({
      campos: [nuevaFila({ clave: 'b', etiqueta: 'B' }), nuevaFila({ clave: 'a', etiqueta: 'A' })],
    })
    expect(validar(form).solicitud?.campos?.map((c) => c.clave)).toEqual(['b', 'a'])
  })
})

describe('moverFila', () => {
  const a = nuevaFila({ clave: 'a' })
  const b = nuevaFila({ clave: 'b' })
  const c = nuevaFila({ clave: 'c' })

  it('intercambia con la vecina de arriba o de abajo', () => {
    expect(moverFila([a, b, c], 1, -1).map((f) => f.clave)).toEqual(['b', 'a', 'c'])
    expect(moverFila([a, b, c], 1, 1).map((f) => f.clave)).toEqual(['a', 'c', 'b'])
  })

  it('en los extremos no cambia nada, y no modifica la lista original', () => {
    const original = [a, b, c]
    expect(moverFila(original, 0, -1)).toBe(original)
    expect(moverFila(original, 2, 1)).toBe(original)
    expect(moverFila(original, 9, 1)).toBe(original)
    moverFila(original, 0, 1)
    expect(original.map((f) => f.clave)).toEqual(['a', 'b', 'c'])
  })
})

describe('erroresDelServidor', () => {
  const form = valido({
    campos: [nuevaFila({ clave: 'a', etiqueta: 'A' }), nuevaFila({ clave: 'b', etiqueta: 'B' })],
  })
  const error = (errores: { campo: string; motivo: string }[]) =>
    new ErrorApi(400, 'Datos inválidos', errores)

  it('pone cada error junto a su entrada, incluidos los de un campo concreto, y no deja nada para el aviso', () => {
    const { errores, aviso } = erroresDelServidor(
      error([
        { campo: 'monto', motivo: 'debe ser mayor o igual a 0' },
        { campo: 'nombre', motivo: 'no debe estar vacío' },
        { campo: 'campos[1].patron', motivo: 'No es una expresion regular valida' },
        { campo: 'campos[0].clave', motivo: 'La clave esta repetida en el tipo' },
      ]),
      form,
    )

    expect(aviso).toBeNull()
    expect(errores.monto).toBe('debe ser mayor o igual a 0')
    expect(errores.nombre).toBe('no debe estar vacío')
    expect(errores.filas[form.campos[1].uid]).toEqual({
      patron: 'No es una expresion regular valida',
    })
    expect(errores.filas[form.campos[0].uid]).toEqual({
      clave: 'La clave esta repetida en el tipo',
    })
  })

  it('un error que no corresponde a ningún campo del formulario va al aviso', () => {
    for (const campo of ['campos[0].orden', 'campos[7].clave', 'activo']) {
      const { aviso } = erroresDelServidor(error([{ campo, motivo: 'x' }]), form)
      expect(aviso).toBeInstanceOf(ErrorApi)
      expect((aviso as ErrorApi).errores).toEqual([{ campo, motivo: 'x' }])
    }
  })

  it('un fallo sin detalle por campo (nombre repetido, sin conexión, error del servidor) va entero al aviso', () => {
    const repetido = new ErrorApi(409, 'Ya existe un tipo con ese nombre')
    expect(erroresDelServidor(repetido, form).aviso).toBe(repetido)
    const sinConexion = ErrorApi.sinConexion()
    expect(erroresDelServidor(sinConexion, form).aviso).toBe(sinConexion)
    const propio = new Error('fallo del código')
    expect(erroresDelServidor(propio, form).aviso).toBe(propio)
  })

  it('si un error se puede poner junto a su campo y otro no, al aviso solo va el que no', () => {
    const original = error([
      { campo: 'nombre', motivo: 'no debe estar vacío' },
      { campo: 'otra.cosa', motivo: 'x' },
    ])

    const { errores, aviso } = erroresDelServidor(original, form)

    expect(errores.nombre).toBe('no debe estar vacío')
    expect((aviso as ErrorApi).errores).toEqual([{ campo: 'otra.cosa', motivo: 'x' }])
    expect((aviso as ErrorApi).estado).toBe(400)
    expect((aviso as ErrorApi).message).toBe('Datos inválidos')
    // El error original no se modifica
    expect(original.errores).toHaveLength(2)
  })
})
