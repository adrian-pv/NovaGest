import { describe, expect, it } from 'vitest'
import { ErrorApi } from '../api/errores'
import { enMoneda, hoyEnGuatemala, tipoDeCambio } from '../formato'
import { fechaDeDireccion, monedaDeDireccion, textoConvencion, validarConsulta } from './divisas'
import { desdeIngreso, erroresDelServidor, esFechaValida, validar } from './formulario'

const HOY = '2026-10-22'

describe('validar un ingreso', () => {
  it('arma la solicitud con la fecha, el monto como número y la descripción recortada', () => {
    const r = validar({ fecha: '2026-10-01', monto: ' 1500,5 ', descripcion: '  Salario  ' }, HOY)
    expect(r.solicitud).toEqual({ fecha: '2026-10-01', montoGtq: 1500.5, descripcion: 'Salario' })
  })

  it('una descripción vacía se manda como null', () => {
    expect(
      validar({ fecha: HOY, monto: '10', descripcion: '   ' }, HOY).solicitud?.descripcion,
    ).toBe(null)
  })

  it.each([
    ['', 'Escribe la fecha del ingreso.'],
    ['2026-02-30', 'Escribe una fecha válida (AAAA-MM-DD).'],
    ['22/10/2026', 'Escribe una fecha válida (AAAA-MM-DD).'],
    ['2026-10-23', 'La fecha no puede ser futura.'],
  ])('rechaza la fecha %j', (fecha, motivo) => {
    const r = validar({ fecha, monto: '10', descripcion: '' }, HOY)
    expect(r.solicitud).toBeUndefined()
    expect(r.errores.fecha).toBe(motivo)
  })

  it('acepta la fecha de hoy', () => {
    expect(validar({ fecha: HOY, monto: '10', descripcion: '' }, HOY).errores.fecha).toBeUndefined()
  })

  it.each([
    ['', 'Escribe el monto en quetzales.'],
    ['-5', 'Escribe un monto sin signo, con hasta 12 enteros y 2 decimales.'],
    ['10.123', 'Escribe un monto sin signo, con hasta 12 enteros y 2 decimales.'],
    ['1234567890123', 'Escribe un monto sin signo, con hasta 12 enteros y 2 decimales.'],
    ['abc', 'Escribe un monto sin signo, con hasta 12 enteros y 2 decimales.'],
    ['0', 'El monto debe ser mayor que cero.'],
    ['0.00', 'El monto debe ser mayor que cero.'],
  ])('rechaza el monto %j', (monto, motivo) => {
    const r = validar({ fecha: HOY, monto, descripcion: '' }, HOY)
    expect(r.solicitud).toBeUndefined()
    expect(r.errores.monto).toBe(motivo)
  })

  it('acepta el mínimo 0.01 y el máximo de 12 enteros con 2 decimales', () => {
    expect(validar({ fecha: HOY, monto: '0.01', descripcion: '' }, HOY).solicitud).toBeDefined()
    expect(
      validar({ fecha: HOY, monto: '999999999999.99', descripcion: '' }, HOY).solicitud,
    ).toBeDefined()
  })

  it('rechaza una descripción de más de 200 caracteres', () => {
    const r = validar({ fecha: HOY, monto: '10', descripcion: 'x'.repeat(201) }, HOY)
    expect(r.errores.descripcion).toBe('Máximo 200 caracteres.')
  })

  it('el formulario de edición muestra el monto con 2 decimales', () => {
    expect(
      desdeIngreso({
        id: 1,
        fecha: '2026-10-01',
        montoGtq: 1500.5,
        descripcion: null,
        creadoEn: '',
        actualizadoEn: '',
      }),
    ).toEqual({ fecha: '2026-10-01', monto: '1500.50', descripcion: '' })
  })
})

describe('errores de la API en el formulario', () => {
  it('pone montoGtq junto al monto y deja en el aviso lo que no tiene campo', () => {
    const error = new ErrorApi(400, 'La solicitud tiene datos inválidos.', [
      { campo: 'montoGtq', motivo: 'debe ser mayor que o igual a 0.01' },
      { campo: 'otro', motivo: 'algo' },
    ])
    const r = erroresDelServidor(error)
    expect(r.errores.monto).toBe('debe ser mayor que o igual a 0.01')
    expect(r.aviso).toBeInstanceOf(ErrorApi)
    expect((r.aviso as ErrorApi).errores).toEqual([{ campo: 'otro', motivo: 'algo' }])
  })

  it('un error sin campos va completo al aviso', () => {
    const error = new ErrorApi(409, 'Conflicto')
    expect(erroresDelServidor(error).aviso).toBe(error)
  })
})

describe('divisas', () => {
  it('explica cada convención sin convertir nada', () => {
    expect(textoConvencion('QUETZALES_POR_DOLAR', 'USD')).toBe(
      'Quetzales por 1 dólar estadounidense',
    )
    expect(textoConvencion('DOLARES_POR_UNIDAD', 'EUR')).toBe('Dólares estadounidenses por 1 EUR')
    expect(textoConvencion('UNIDADES_POR_DOLAR', 'MXN')).toBe('MXN por 1 dólar estadounidense')
    expect(textoConvencion('NUEVA', 'XYZ')).toBe('NUEVA')
  })

  it('de la dirección solo toma fechas AAAA-MM-DD y códigos de tres letras', () => {
    expect(fechaDeDireccion('2026-10-01')).toBe('2026-10-01')
    expect(fechaDeDireccion('ayer')).toBe('')
    expect(fechaDeDireccion(null)).toBe('')
    expect(monedaDeDireccion('eur')).toBe('EUR')
    expect(monedaDeDireccion('EURO')).toBe('')
    expect(monedaDeDireccion('<b>')).toBe('')
  })

  it('valida la consulta de proyección con las reglas de la API', () => {
    const base = { moneda: 'USD', desde: '', hasta: '', fecha: '' }
    expect(validarConsulta(base, HOY)).toEqual({})
    expect(validarConsulta({ ...base, desde: '2026-10-10', hasta: '2026-10-01' }, HOY).desde).toBe(
      'No puede ser posterior a «Hasta».',
    )
    expect(validarConsulta({ ...base, fecha: '2026-10-23' }, HOY).fecha).toMatch(/futura/)
    expect(validarConsulta({ ...base, hasta: '2026-13-01' }, HOY).hasta).toBe(
      'Escribe una fecha válida.',
    )
  })

  it('reconoce fechas reales del calendario', () => {
    expect(esFechaValida('2024-02-29')).toBe(true)
    expect(esFechaValida('2026-02-29')).toBe(false)
  })
})

describe('formato de divisas', () => {
  it('muestra otra moneda con su código y 2 decimales', () => {
    expect(enMoneda(1234.5, 'EUR')).toMatch(/EUR\s?1,234\.50/)
    expect(enMoneda(10, 'JPY')).toMatch(/JPY\s?10\.00/)
  })

  it('muestra el tipo de cambio con hasta 6 decimales', () => {
    expect(tipoDeCambio(7.654321)).toBe('7.654321')
    expect(tipoDeCambio(1.1)).toBe('1.10')
  })

  it('la fecha de hoy se cuenta en hora de Guatemala', () => {
    // 22 de octubre a las 23:30 en Guatemala ya es 23 en UTC
    expect(hoyEnGuatemala(new Date('2026-10-23T05:30:00Z'))).toBe('2026-10-22')
    expect(hoyEnGuatemala(new Date('2026-10-23T06:30:00Z'))).toBe('2026-10-23')
  })
})
