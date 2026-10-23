import { fireEvent, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Perfil } from '../api/tipos'
import type { Pago } from '../api/pagos'
import { json, problema, PERFIL_CIUDADANA } from '../test/api-simulada'
import { GESTOR, HISTORIAL, pagina, TIPO_ORNATO, tramite } from '../test/datos'
import { pago } from '../test/pagos'
import { limpiarSesion, renderizarApp, simularSesion } from '../test/utilidades'

beforeEach(limpiarSesion)
afterEach(() => vi.unstubAllGlobals())

function abrir(perfil: Perfil = GESTOR, inicial: Pago = pago(), fallo?: number) {
  let actual = inicial
  let finalizado = false
  const llamadas = simularSesion(perfil, {
    'GET /api/tramites/12': () =>
      json(tramite({ estado: finalizado ? 'FINALIZADO' : 'POR_PAGAR' })),
    'GET /api/tipos-tramite/1': () => json(TIPO_ORNATO),
    'GET /api/tramites/12/historial': () => json(HISTORIAL),
    'GET /api/tramites/12/transiciones': () => json([]),
    'GET /api/pagos': () => json(pagina([actual])),
    'POST /api/pagos/5/validacion': ({ cuerpo }) => {
      if (fallo)
        return problema(fallo, fallo === 409 ? 'El pago ya fue resuelto' : 'No tienes permiso')
      const decision = cuerpo as { decision: string; comentario?: string }
      finalizado = decision.decision === 'VALIDAR'
      actual = {
        ...actual,
        estado: finalizado ? 'VALIDADO' : 'RECHAZADO',
        comentario: decision.comentario ?? null,
      }
      return json({ ...actual, tramiteEstado: finalizado ? 'FINALIZADO' : 'POR_PAGAR' })
    },
  })
  renderizarApp('/tramites/12')
  return llamadas
}

async function seccion() {
  const region = within(await screen.findByRole('region', { name: 'Pago' }))
  await region.findByText('Comprobantes enviados')
  return region
}

it('confirma la validación y recarga el estado, las acciones y el historial', async () => {
  const llamadas = abrir()
  const region = await seccion()
  const usuario = userEvent.setup()
  await usuario.click(region.getByRole('button', { name: 'Validar el pago 5' }))
  expect(
    llamadas.filter((l) => l.metodo === 'POST' && l.ruta.includes('/validacion')),
  ).toHaveLength(0)
  await usuario.click(region.getByRole('button', { name: 'Confirmar validación' }))
  expect(
    await screen.findByText('El pago fue validado y el trámite quedó finalizado.'),
  ).toBeInTheDocument()
  expect(llamadas.find((l) => l.ruta.endsWith('/validacion'))?.cuerpo).toEqual({
    decision: 'VALIDAR',
  })
  await waitFor(() =>
    expect(llamadas.filter((l) => l.ruta.endsWith('/historial')).length).toBeGreaterThan(2),
  )
  expect(region.queryByRole('button', { name: 'Validar el pago 5' })).not.toBeInTheDocument()
})

it('exige un motivo no vacío al rechazar y conserva el trámite por pagar', async () => {
  const llamadas = abrir()
  const region = await seccion()
  const usuario = userEvent.setup()
  await usuario.click(region.getByRole('button', { name: 'Rechazar el pago 5' }))
  const confirmar = region.getByRole('button', { name: 'Confirmar rechazo' })
  expect(confirmar).toBeDisabled()
  await usuario.type(region.getByLabelText('Motivo del rechazo'), '   ')
  expect(confirmar).toBeDisabled()
  await usuario.type(region.getByLabelText('Motivo del rechazo'), 'Archivo ilegible')
  await usuario.click(confirmar)
  expect(await region.findByText('El último comprobante fue rechazado')).toBeInTheDocument()
  expect(region.getByRole('status')).toHaveTextContent('Archivo ilegible')
  expect(llamadas.find((l) => l.ruta.endsWith('/validacion'))?.cuerpo).toEqual({
    decision: 'RECHAZAR',
    comentario: 'Archivo ilegible',
  })
  expect(screen.getAllByText('Por pagar').length).toBeGreaterThan(0)
})

it.each([
  {
    ...PERFIL_CIUDADANA,
    permisos: ['tramite:leer', 'tipo_tramite:leer', 'pago:leer', 'pago:crear'],
  },
  { ...GESTOR, roles: ['AUDITOR'], permisos: ['tramite:leer', 'tipo_tramite:leer', 'pago:leer'] },
])('no ofrece decisiones sin pago:editar', async (perfil) => {
  const llamadas = abrir(perfil)
  const region = await seccion()
  expect(region.queryByRole('button', { name: 'Validar el pago 5' })).not.toBeInTheDocument()
  expect(region.queryByRole('button', { name: 'Rechazar el pago 5' })).not.toBeInTheDocument()
  expect(llamadas.some((l) => l.ruta.endsWith('/validacion'))).toBe(false)
})

it('impide resolver un pago propio aunque tenga el permiso', async () => {
  abrir(GESTOR, pago({ creadoPor: GESTOR.id }))
  const region = await seccion()
  expect(region.getByText('No puedes resolver un pago que tú registraste.')).toBeInTheDocument()
  expect(region.queryByRole('button', { name: 'Validar el pago 5' })).not.toBeInTheDocument()
})

it.each(['VALIDADO', 'RECHAZADO'] as const)('no permite resolver un pago %s', async (estado) => {
  abrir(GESTOR, pago({ estado }))
  expect(
    (await seccion()).queryByRole('button', { name: 'Validar el pago 5' }),
  ).not.toBeInTheDocument()
})

it.each([403, 409])('muestra el error %s sin presentar una decisión exitosa', async (estado) => {
  abrir(GESTOR, pago(), estado)
  const region = await seccion()
  const usuario = userEvent.setup()
  await usuario.click(region.getByRole('button', { name: 'Validar el pago 5' }))
  await usuario.click(region.getByRole('button', { name: 'Confirmar validación' }))
  expect(await region.findByRole('alert')).toBeInTheDocument()
  expect(
    region.queryByText('El pago fue validado y el trámite quedó finalizado.'),
  ).not.toBeInTheDocument()
  if (estado === 409)
    expect(region.getByRole('button', { name: 'Actualizar estado del pago' })).toBeInTheDocument()
})

it('dos envíos seguidos de la confirmación mandan una sola decisión', async () => {
  const llamadas = abrir()
  const region = await seccion()
  await userEvent.setup().click(region.getByRole('button', { name: 'Validar el pago 5' }))
  const formulario = region.getByRole('button', { name: 'Confirmar validación' }).closest('form')!
  // Dos envíos antes de que React vuelva a pintar: solo la guardia ocupado.current frena el segundo.
  fireEvent.submit(formulario)
  fireEvent.submit(formulario)
  expect(
    await screen.findByText('El pago fue validado y el trámite quedó finalizado.'),
  ).toBeInTheDocument()
  expect(llamadas.filter((l) => l.ruta.endsWith('/validacion'))).toHaveLength(1)
})

it('cancelar no envía ninguna decisión', async () => {
  const llamadas = abrir()
  const region = await seccion()
  const usuario = userEvent.setup()
  await usuario.click(region.getByRole('button', { name: 'Validar el pago 5' }))
  await usuario.click(region.getByRole('button', { name: 'Cancelar' }))
  expect(region.getByRole('button', { name: 'Validar el pago 5' })).toBeInTheDocument()
  expect(llamadas.some((l) => l.ruta.endsWith('/validacion'))).toBe(false)
})
