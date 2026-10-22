import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { GESTOR, pagina } from '../test/datos'
import { PERFIL_CIUDADANA, json, problema } from '../test/api-simulada'
import { pago, descarga } from '../test/pagos'
import { limpiarSesion, renderizarApp, simularSesion } from '../test/utilidades'
import { guardarArchivo } from '../descarga'

vi.mock('../descarga', () => ({ guardarArchivo: vi.fn() }))
beforeEach(() => {
  limpiarSesion()
  vi.mocked(guardarArchivo).mockClear()
})
afterEach(() => vi.unstubAllGlobals())

it('lista solo pendientes, ordena por antigüedad y pagina en el servidor', async () => {
  const llamadas = simularSesion(GESTOR, {
    'GET /api/pagos': ({ ruta }) =>
      json(
        pagina([pago()], {
          number: Number(new URL(ruta, 'http://local').searchParams.get('page')),
          totalPages: 2,
          totalElements: 21,
        }),
      ),
  })
  renderizarApp('/pagos')
  expect(await screen.findByRole('link', { name: 'Ver trámite #12' })).toHaveAttribute(
    'href',
    '/tramites/12',
  )
  expect(
    llamadas.some((l) => l.ruta === '/api/pagos?estado=PENDIENTE&page=0&sort=creadoEn%2Casc'),
  ).toBe(true)
  await userEvent.setup().click(screen.getByRole('button', { name: 'Siguiente' }))
  expect(await screen.findByText('Página 2 de 2')).toBeInTheDocument()
})

it('descarga el comprobante desde la lista con el cliente autenticado', async () => {
  simularSesion(GESTOR, {
    'GET /api/pagos': () => json(pagina([pago()])),
    'GET /api/pagos/5/comprobante': () => descarga('prueba.pdf'),
  })
  renderizarApp('/pagos')
  await userEvent
    .setup()
    .click(await screen.findByRole('button', { name: 'Descargar comprobante' }))
  expect(guardarArchivo).toHaveBeenCalledWith(expect.anything(), 'prueba.pdf', 'comprobante-5')
})

it('valida y retira el pago resuelto de la lista', async () => {
  let resuelto = false
  simularSesion(GESTOR, {
    'GET /api/pagos': () => json(pagina(resuelto ? [] : [pago()])),
    'POST /api/pagos/5/validacion': () => {
      resuelto = true
      return json(pago({ estado: 'VALIDADO', tramiteEstado: 'FINALIZADO' }))
    },
  })
  renderizarApp('/pagos')
  const usuario = userEvent.setup()
  await usuario.click(await screen.findByRole('button', { name: 'Validar pago' }))
  await usuario.click(screen.getByRole('button', { name: 'Confirmar validación' }))
  expect(await screen.findByText('No hay pagos pendientes en esta página.')).toBeInTheDocument()
})

it('explica por qué no se puede resolver un pago registrado por la misma persona', async () => {
  simularSesion(GESTOR, { 'GET /api/pagos': () => json(pagina([pago({ creadoPor: GESTOR.id })])) })
  renderizarApp('/pagos')
  expect(
    await screen.findByText('No puedes resolver un pago que tú registraste.'),
  ).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Validar pago' })).not.toBeInTheDocument()
})

it.each([
  PERFIL_CIUDADANA,
  { ...GESTOR, roles: ['AUDITOR'], permisos: ['pago:leer'] },
  { ...GESTOR, alcanceTotal: false },
])('rechaza la ruta sin permiso o alcance total', async (perfil) => {
  const llamadas = simularSesion(perfil)
  renderizarApp('/pagos')
  expect(await screen.findByRole('heading', { name: /permiso/i })).toBeInTheDocument()
  expect(llamadas.some((l) => l.ruta.startsWith('/api/pagos'))).toBe(false)
})

it('muestra un error de servidor y permite reintentar', async () => {
  let primera = true
  simularSesion(GESTOR, {
    'GET /api/pagos': () => {
      if (primera) {
        primera = false
        return problema(500, 'detalle interno')
      }
      return json(pagina([]))
    },
  })
  renderizarApp('/pagos')
  const alerta = await screen.findByRole('alert')
  expect(alerta).not.toHaveTextContent('detalle interno')
  await userEvent
    .setup()
    .click(within(alerta.parentElement!).getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByText('No hay pagos pendientes en esta página.')).toBeInTheDocument()
})
