import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Pago } from '../api/pagos'
import type { EstadoTramite } from '../api/tramites'
import { guardarArchivo } from '../descarga'
import { json, PERFIL_CIUDADANA, problema } from '../test/api-simulada'
import { GESTOR, HISTORIAL, pagina, TIPO_ORNATO, tramite } from '../test/datos'
import { archivo, descarga, pago } from '../test/pagos'
import { limpiarSesion, renderizarApp, simularSesion } from '../test/utilidades'

vi.mock('../descarga', () => ({ guardarArchivo: vi.fn() }))

const CIUDADANO = {
  ...PERFIL_CIUDADANA,
  permisos: ['tramite:leer', 'tipo_tramite:leer', 'pago:leer', 'pago:crear'],
}

function rutas(estado: EstadoTramite, pagos: Pago[], extra = {}) {
  return {
    'GET /api/tramites/12': () => json(tramite({ estado })),
    'GET /api/tipos-tramite/1': () => json(TIPO_ORNATO),
    'GET /api/tramites/12/historial': () => json(HISTORIAL),
    'GET /api/tramites/12/transiciones': () => json([]),
    'GET /api/pagos': () => json(pagina(pagos)),
    ...extra,
  }
}

async function seccionPago() {
  return within(await screen.findByRole('region', { name: 'Pago' }))
}

beforeEach(() => {
  limpiarSesion()
  vi.mocked(guardarArchivo).mockClear()
})
afterEach(() => vi.unstubAllGlobals())

describe('sección de pago: cuándo aparece', () => {
  it.each(['BORRADOR', 'ENVIADO', 'EN_REVISION', 'OBSERVADO', 'RECHAZADO'] as const)(
    'no aparece ni consulta pagos en un trámite %s',
    async (estado) => {
      const llamadas = simularSesion(CIUDADANO, rutas(estado, []))

      renderizarApp('/tramites/12')

      await screen.findByRole('heading', { name: /Trámite #12/ })
      expect(screen.queryByRole('region', { name: 'Pago' })).not.toBeInTheDocument()
      expect(llamadas.some((l) => l.ruta.startsWith('/api/pagos'))).toBe(false)
    },
  )

  it('no aparece para quien no tiene permiso de leer pagos', async () => {
    const llamadas = simularSesion(
      { ...CIUDADANO, permisos: ['tramite:leer', 'tipo_tramite:leer'] },
      rutas('POR_PAGAR', []),
    )

    renderizarApp('/tramites/12')

    await screen.findByRole('heading', { name: /Trámite #12/ })
    expect(screen.queryByRole('region', { name: 'Pago' })).not.toBeInTheDocument()
    expect(llamadas.some((l) => l.ruta.startsWith('/api/pagos'))).toBe(false)
  })

  it('pide los pagos de ese trámite', async () => {
    const llamadas = simularSesion(CIUDADANO, rutas('POR_PAGAR', []))

    renderizarApp('/tramites/12')

    await seccionPago()
    expect(llamadas.some((l) => l.ruta === '/api/pagos?tramiteId=12')).toBe(true)
  })

  it('muestra el monto a pagar si el tipo tiene costo', async () => {
    simularSesion(CIUDADANO, rutas('POR_PAGAR', []))

    renderizarApp('/tramites/12')

    expect((await seccionPago()).getByText(/Q\s?25\.00/)).toBeInTheDocument()
  })

  it('si falla la carga de pagos avisa sin detalles internos y permite reintentar', async () => {
    let intentos = 0
    simularSesion(
      CIUDADANO,
      rutas('POR_PAGAR', [], {
        'GET /api/pagos': () =>
          ++intentos === 1 ? problema(500, 'org.postgresql.PSQLException') : json(pagina([])),
      }),
    )
    renderizarApp('/tramites/12')

    const seccion = await seccionPago()
    const alerta = await seccion.findByRole('alert')
    expect(alerta).toHaveTextContent('Error del servidor')
    expect(alerta).not.toHaveTextContent('PSQL')
    await userEvent.setup().click(seccion.getByRole('button', { name: 'Reintentar' }))

    expect(await seccion.findByLabelText('Comprobante de pago')).toBeInTheDocument()
  })
})

describe('sección de pago: subir el comprobante', () => {
  async function abrir(extra = {}) {
    const llamadas = simularSesion(CIUDADANO, rutas('POR_PAGAR', [], extra))
    renderizarApp('/tramites/12')
    const seccion = await seccionPago()
    return { llamadas, seccion, campo: await seccion.findByLabelText('Comprobante de pago') }
  }

  it('ofrece el formulario con la ayuda de formatos y tamaño, y el botón desactivado hasta elegir un archivo', async () => {
    const { seccion, campo } = await abrir()

    expect(campo).toHaveAttribute('type', 'file')
    expect(campo).toHaveAccessibleDescription('PDF, JPG o PNG, de hasta 5 MB.')
    expect(seccion.getByRole('button', { name: 'Subir comprobante' })).toBeDisabled()
  })

  it('sube el comprobante como multipart en el campo "comprobante" y muestra el pago pendiente', async () => {
    let subido = false
    const { llamadas, seccion, campo } = await abrir({
      'GET /api/pagos': () => json(pagina(subido ? [pago()] : [])),
      'POST /api/tramites/12/pagos': () => {
        subido = true
        return json(pago(), 201)
      },
    })
    const usuario = userEvent.setup()

    await usuario.upload(campo, archivo('recibo.pdf', 'application/pdf'))
    expect(campo).toHaveAccessibleDescription(/Elegiste recibo\.pdf \(1 KB\)/)
    await usuario.click(seccion.getByRole('button', { name: 'Subir comprobante' }))

    expect(await seccion.findByText(/Recibimos tu comprobante/)).toBeInTheDocument()
    const envio = llamadas.find((l) => l.metodo === 'POST' && l.ruta === '/api/tramites/12/pagos')
    const cuerpo = envio?.cuerpo as FormData
    expect(cuerpo).toBeInstanceOf(FormData)
    expect((cuerpo.get('comprobante') as File).name).toBe('recibo.pdf')
    // El navegador debe poner el Content-Type con su separador; si se fijara a mano, la API no podría leerlo
    expect(envio?.cabeceras['Content-Type']).toBeUndefined()
    expect(envio?.cabeceras.Authorization).toMatch(/^Bearer /)
    expect(seccion.queryByLabelText('Comprobante de pago')).not.toBeInTheDocument()
    expect(seccion.getByText('Pendiente de validación')).toBeInTheDocument()
  })

  it('un archivo de más de 5 MB se rechaza al elegirlo, antes de enviarlo', async () => {
    const { llamadas, seccion, campo } = await abrir()

    await userEvent
      .setup()
      .upload(campo, archivo('grande.pdf', 'application/pdf', 5 * 1024 * 1024 + 1))

    expect(await seccion.findByText(/el máximo es 5 MB/)).toBeInTheDocument()
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(seccion.getByRole('button', { name: 'Subir comprobante' })).toBeDisabled()
    expect(llamadas.some((l) => l.metodo === 'POST' && l.ruta.endsWith('/pagos'))).toBe(false)
  })

  it('un archivo de otro tipo se rechaza al elegirlo', async () => {
    const { seccion, campo } = await abrir()

    await userEvent.setup({ applyAccept: false }).upload(campo, archivo('notas.txt', 'text/plain'))

    expect(await seccion.findByText('Debe ser un archivo PDF, JPG o PNG.')).toBeInTheDocument()
    expect(seccion.getByRole('button', { name: 'Subir comprobante' })).toBeDisabled()
  })

  it('un archivo vacío se rechaza al elegirlo', async () => {
    const { seccion, campo } = await abrir()

    await userEvent.setup().upload(campo, archivo('vacio.pdf', 'application/pdf', 0))

    expect(await seccion.findByText('El archivo está vacío.')).toBeInTheDocument()
  })

  it('al elegir otro archivo válido desaparece el aviso anterior', async () => {
    const { seccion, campo } = await abrir()
    const usuario = userEvent.setup({ applyAccept: false })
    await usuario.upload(campo, archivo('notas.txt', 'text/plain'))
    await seccion.findByText(/Debe ser un archivo/)

    await usuario.upload(campo, archivo('recibo.png', 'image/png'))

    expect(seccion.queryByText(/Debe ser un archivo/)).not.toBeInTheDocument()
    expect(seccion.getByRole('button', { name: 'Subir comprobante' })).toBeEnabled()
  })

  it('si la API rechaza el contenido, el motivo sale junto al campo y no como aviso repetido', async () => {
    const { seccion, campo } = await abrir({
      'POST /api/tramites/12/pagos': () =>
        problema(400, 'La solicitud tiene campos invalidos', [
          { campo: 'comprobante', motivo: 'Debe ser un archivo PDF, JPG o PNG' },
        ]),
    })
    const usuario = userEvent.setup()

    await usuario.upload(campo, archivo('falso.pdf', 'application/pdf'))
    await usuario.click(seccion.getByRole('button', { name: 'Subir comprobante' }))

    expect(await seccion.findByText('Debe ser un archivo PDF, JPG o PNG')).toBeInTheDocument()
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(seccion.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each([
    [413, 'El comprobante pesa mas de 5 MB', 'No se pudo completar'],
    [409, 'El tramite ya tiene un pago pendiente de validacion', 'No se pudo completar'],
    [403, 'No tienes permiso para esta accion', 'Sin permiso'],
  ])('un error %i de la API se muestra como aviso', async (estado, detalle, titulo) => {
    const { seccion, campo } = await abrir({
      'POST /api/tramites/12/pagos': () => problema(estado, detalle),
    })
    const usuario = userEvent.setup()

    await usuario.upload(campo, archivo('recibo.pdf', 'application/pdf'))
    await usuario.click(seccion.getByRole('button', { name: 'Subir comprobante' }))

    const alerta = await seccion.findByRole('alert')
    expect(alerta).toHaveTextContent(detalle)
    expect(alerta).toHaveTextContent(titulo)
  })

  it('un error del servidor al subir no revela detalles internos', async () => {
    const { seccion, campo } = await abrir({
      'POST /api/tramites/12/pagos': () =>
        problema(500, 'java.io.IOException: /data/comprobantes/x'),
    })
    const usuario = userEvent.setup()

    await usuario.upload(campo, archivo('recibo.pdf', 'application/pdf'))
    await usuario.click(seccion.getByRole('button', { name: 'Subir comprobante' }))

    const alerta = await seccion.findByRole('alert')
    expect(alerta).toHaveTextContent('Error del servidor')
    expect(alerta).not.toHaveTextContent('/data/comprobantes')
  })
})

describe('sección de pago: estado de los comprobantes', () => {
  it('con un pago pendiente no deja subir otro y explica que un gestor lo revisará', async () => {
    simularSesion(CIUDADANO, rutas('POR_PAGAR', [pago()]))

    renderizarApp('/tramites/12')

    const seccion = await seccionPago()
    expect(await seccion.findByText(/Recibimos tu comprobante/)).toBeInTheDocument()
    expect(seccion.queryByLabelText('Comprobante de pago')).not.toBeInTheDocument()
    expect(seccion.getByText('Pendiente de validación')).toBeInTheDocument()
    expect(seccion.getByText(/PDF · 1 KB/)).toBeInTheDocument()
  })

  it('tras un rechazo muestra el motivo y permite subir uno nuevo', async () => {
    simularSesion(
      CIUDADANO,
      rutas('POR_PAGAR', [pago({ estado: 'RECHAZADO', comentario: 'No se lee el monto' })]),
    )

    renderizarApp('/tramites/12')

    const seccion = await seccionPago()
    expect(await seccion.findByText('Tu último comprobante fue rechazado')).toBeInTheDocument()
    expect(seccion.getAllByText(/No se lee el monto/)).toHaveLength(2)
    expect(seccion.getByLabelText('Comprobante de pago')).toBeInTheDocument()
    expect(seccion.getByText('Rechazado')).toHaveClass('insignia--error')
  })

  it('con el pago validado y el trámite finalizado lo celebra y no ofrece subir nada', async () => {
    simularSesion(
      CIUDADANO,
      rutas('FINALIZADO', [pago({ estado: 'VALIDADO', validadoEn: '2026-10-20T20:30:00Z' })]),
    )

    renderizarApp('/tramites/12')

    const seccion = await seccionPago()
    expect(
      await seccion.findByText(/El pago fue validado y el trámite quedó finalizado/),
    ).toBeInTheDocument()
    expect(seccion.queryByLabelText('Comprobante de pago')).not.toBeInTheDocument()
    expect(seccion.getByText('Validado')).toHaveClass('insignia--exito')
    expect(seccion.getByText(/Validado el /)).not.toHaveTextContent(/\.\.$/)
  })

  it('muestra el historial de comprobantes, el más reciente primero', async () => {
    simularSesion(
      CIUDADANO,
      rutas('POR_PAGAR', [
        pago({ id: 6, estado: 'PENDIENTE', comprobanteTipo: 'image/png' }),
        pago({ id: 5, estado: 'RECHAZADO', comentario: 'Borroso' }),
      ]),
    )

    renderizarApp('/tramites/12')

    const seccion = await seccionPago()
    const filas = await seccion.findAllByRole('listitem')
    expect(filas).toHaveLength(2)
    expect(within(filas[0]).getByText(/PNG/)).toBeInTheDocument()
    expect(within(filas[1]).getByText(/PDF/)).toBeInTheDocument()
  })

  it('quien puede leer pagos pero no crearlos (el personal) ve los comprobantes y no el formulario', async () => {
    simularSesion(GESTOR, rutas('POR_PAGAR', [pago()]))

    renderizarApp('/tramites/12')

    const seccion = await seccionPago()
    expect(await seccion.findByText('Pendiente de validación')).toBeInTheDocument()
    expect(seccion.queryByLabelText('Comprobante de pago')).not.toBeInTheDocument()
  })

  it('si no hay comprobante y no se puede subir, lo dice', async () => {
    simularSesion(GESTOR, rutas('POR_PAGAR', []))

    renderizarApp('/tramites/12')

    const seccion = await seccionPago()
    expect(await seccion.findByText(/Todavía no hay un comprobante de pago/)).toBeInTheDocument()
  })
})

describe('sección de pago: descargar el comprobante', () => {
  it('descarga con la sesión y entrega el archivo con el nombre que sugirió la API', async () => {
    const llamadas = simularSesion(
      CIUDADANO,
      rutas('POR_PAGAR', [pago()], {
        'GET /api/pagos/5/comprobante': () => descarga('comprobante-5.pdf'),
      }),
    )
    renderizarApp('/tramites/12')
    const seccion = await seccionPago()

    await userEvent
      .setup()
      .click(await seccion.findByRole('button', { name: 'Descargar el comprobante del pago 5' }))

    await vi.waitFor(() => expect(guardarArchivo).toHaveBeenCalledTimes(1))
    const [contenido, nombre, respaldo] = vi.mocked(guardarArchivo).mock.calls[0]
    expect(contenido.type).toBe('application/pdf')
    expect(contenido.size).toBeGreaterThan(0)
    expect(nombre).toBe('comprobante-5.pdf')
    expect(respaldo).toBe('comprobante-5')
    const peticion = llamadas.find((l) => l.ruta === '/api/pagos/5/comprobante')
    expect(peticion?.cabeceras.Accept).toBe('*/*')
    expect(peticion?.cabeceras.Authorization).toMatch(/^Bearer /)
  })

  it('si la API sugiere un nombre peligroso se usa el de respaldo', async () => {
    simularSesion(
      CIUDADANO,
      rutas('POR_PAGAR', [pago()], {
        'GET /api/pagos/5/comprobante': () => descarga('../../mala.exe'),
      }),
    )
    renderizarApp('/tramites/12')
    const seccion = await seccionPago()

    await userEvent
      .setup()
      .click(await seccion.findByRole('button', { name: /Descargar el comprobante del pago 5/ }))

    await vi.waitFor(() => expect(guardarArchivo).toHaveBeenCalledTimes(1))
    expect(vi.mocked(guardarArchivo).mock.calls[0][1]).toBeNull()
  })

  it('si la descarga falla avisa y no entrega ningún archivo', async () => {
    simularSesion(
      CIUDADANO,
      rutas('POR_PAGAR', [pago()], {
        'GET /api/pagos/5/comprobante': () => problema(404, 'El pago no existe'),
      }),
    )
    renderizarApp('/tramites/12')
    const seccion = await seccionPago()

    await userEvent
      .setup()
      .click(await seccion.findByRole('button', { name: /Descargar el comprobante del pago 5/ }))

    expect(await seccion.findByRole('alert')).toHaveTextContent('No encontrado')
    expect(guardarArchivo).not.toHaveBeenCalled()
  })
})
