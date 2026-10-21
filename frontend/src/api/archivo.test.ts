import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configurarRenovador, nombreDeDescarga, solicitarArchivo } from './cliente'
import { ErrorApi } from './errores'
import { guardarToken } from './token'
import { problema, simularApi } from '../test/api-simulada'
import { descarga } from '../test/pagos'

beforeEach(() => {
  guardarToken('acceso-vigente')
  configurarRenovador(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
  guardarToken(null)
  configurarRenovador(null)
})

describe('nombreDeDescarga', () => {
  it.each([
    ['attachment; filename="comprobante-5.pdf"', 'comprobante-5.pdf'],
    ['attachment; filename=comprobante-7.png', 'comprobante-7.png'],
    ["attachment; filename*=UTF-8''comprobante-9.jpg", 'comprobante-9.jpg'],
    ['attachment; filename="comprobante-5.pdf"; size=10', 'comprobante-5.pdf'],
  ])('lee el nombre de "%s"', (cabecera, esperado) => {
    expect(nombreDeDescarga(cabecera)).toBe(esperado)
  })

  it.each([
    'attachment; filename="../../etc/passwd"',
    'attachment; filename="..\\\\windows\\\\sistema.exe"',
    'attachment; filename="con espacio.pdf"',
    'attachment; filename=".oculto"',
    'attachment; filename="recibo<script>.pdf"',
    `attachment; filename="${'a'.repeat(101)}.pdf"`,
    'attachment',
    '',
  ])('descarta un nombre manipulado o ausente: %s', (cabecera) => {
    expect(nombreDeDescarga(cabecera)).toBeNull()
  })

  it('sin cabecera devuelve null', () => {
    expect(nombreDeDescarga(null)).toBeNull()
  })
})

describe('solicitarArchivo', () => {
  it('pide cualquier tipo de contenido: con Accept: application/json la API respondería 406', async () => {
    const llamadas = simularApi({
      'GET /api/pagos/5/comprobante': () => descarga('comprobante-5.pdf'),
    })

    await solicitarArchivo('/api/pagos/5/comprobante')

    expect(llamadas[0].cabeceras.Accept).toBe('*/*')
    expect(llamadas[0].cabeceras.Authorization).toBe('Bearer acceso-vigente')
  })

  it('devuelve el contenido y el nombre que sugirió la API', async () => {
    simularApi({ 'GET /api/pagos/5/comprobante': () => descarga('comprobante-5.pdf') })

    const archivo = await solicitarArchivo('/api/pagos/5/comprobante')

    expect(archivo.nombre).toBe('comprobante-5.pdf')
    expect(archivo.contenido.type).toBe('application/pdf')
    expect(archivo.contenido.size).toBeGreaterThan(0)
  })

  it('si la API no sugiere nombre o sugiere uno peligroso, el nombre es null', async () => {
    simularApi({
      'GET /a': () => descarga(null),
      'GET /b': () => descarga('../../mala.exe'),
    })

    expect((await solicitarArchivo('/a')).nombre).toBeNull()
    expect((await solicitarArchivo('/b')).nombre).toBeNull()
  })

  it('un error de la API llega como ErrorApi', async () => {
    simularApi({ 'GET /api/pagos/5/comprobante': () => problema(404, 'El pago no existe') })

    const error = (await solicitarArchivo('/api/pagos/5/comprobante').catch(
      (e: unknown) => e,
    )) as ErrorApi

    expect(error).toBeInstanceOf(ErrorApi)
    expect(error.estado).toBe(404)
  })

  it('con el token vencido renueva la sesión y reintenta, igual que las demás llamadas', async () => {
    let intentos = 0
    const llamadas = simularApi({
      'GET /api/pagos/5/comprobante': () =>
        ++intentos === 1 ? problema(401, 'Token vencido') : descarga('comprobante-5.pdf'),
    })
    configurarRenovador(async () => {
      guardarToken('acceso-nuevo')
      return true
    })

    const archivo = await solicitarArchivo('/api/pagos/5/comprobante')

    expect(archivo.nombre).toBe('comprobante-5.pdf')
    expect(llamadas[1].cabeceras.Authorization).toBe('Bearer acceso-nuevo')
  })
})
