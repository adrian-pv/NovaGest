import { describe, expect, it } from 'vitest'
import { archivo } from '../test/pagos'
import { TAMANO_MAXIMO, motivoDeRechazo, tamanoLegible } from './comprobante'

describe('motivoDeRechazo', () => {
  it.each([
    ['recibo.pdf', 'application/pdf'],
    ['foto.jpg', 'image/jpeg'],
    ['foto.jpeg', 'image/jpeg'],
    ['captura.png', 'image/png'],
    ['RECIBO.PDF', 'application/pdf'],
  ])('acepta %s', (nombre, tipo) => {
    expect(motivoDeRechazo(archivo(nombre, tipo))).toBeNull()
  })

  it('acepta un archivo cuyo tipo no declara el sistema pero tiene extensión válida', () => {
    expect(motivoDeRechazo(archivo('recibo.pdf', ''))).toBeNull()
  })

  it('acepta un archivo con tipo válido aunque la extensión sea rara', () => {
    expect(motivoDeRechazo(archivo('recibo', 'application/pdf'))).toBeNull()
  })

  it.each([
    ['notas.txt', 'text/plain'],
    ['programa.exe', 'application/x-msdownload'],
    ['hoja.xlsx', 'application/vnd.ms-excel'],
    ['imagen.gif', 'image/gif'],
    ['pagina.html', 'text/html'],
    ['sin-extension', ''],
  ])('rechaza %s', (nombre, tipo) => {
    expect(motivoDeRechazo(archivo(nombre, tipo))).toBe('Debe ser un archivo PDF, JPG o PNG.')
  })

  it('acepta exactamente 5 MB pero rechaza un byte más', () => {
    expect(motivoDeRechazo(archivo('a.pdf', 'application/pdf', TAMANO_MAXIMO))).toBeNull()
    expect(motivoDeRechazo(archivo('a.pdf', 'application/pdf', TAMANO_MAXIMO + 1))).toContain(
      'el máximo es 5 MB',
    )
  })

  it('rechaza un archivo vacío', () => {
    expect(motivoDeRechazo(archivo('a.pdf', 'application/pdf', 0))).toBe('El archivo está vacío.')
  })

  it('el aviso por tamaño dice cuánto pesa', () => {
    const grande = archivo('a.pdf', 'application/pdf', 7 * 1024 * 1024)
    expect(motivoDeRechazo(grande)).toBe('El archivo pesa 7.0 MB y el máximo es 5 MB.')
  })
})

describe('tamanoLegible', () => {
  it.each([
    [1, '1 KB'],
    [850, '1 KB'],
    [1024, '1 KB'],
    [1536, '2 KB'],
    [500 * 1024, '500 KB'],
    [1024 * 1024, '1.0 MB'],
    [1.5 * 1024 * 1024, '1.5 MB'],
  ])('%d bytes se muestra como %s', (bytes, esperado) => {
    expect(tamanoLegible(bytes)).toBe(esperado)
  })
})
