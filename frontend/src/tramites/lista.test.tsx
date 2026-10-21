import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { json, PERFIL_CIUDADANA, problema } from '../test/api-simulada'
import { GESTOR, pagina, TIPO_IGSS, TIPO_ORNATO, tramite } from '../test/datos'
import { limpiarSesion, renderizarApp, simularSesion } from '../test/utilidades'

const CIUDADANO = {
  ...PERFIL_CIUDADANA,
  permisos: ['tramite:leer', 'tramite:crear', 'tipo_tramite:leer'],
}

const TIPOS = { 'GET /api/tipos-tramite': () => json(pagina([TIPO_ORNATO, TIPO_IGSS])) }

beforeEach(() => limpiarSesion())
afterEach(() => vi.unstubAllGlobals())

describe('listado de trámites', () => {
  it('muestra cada trámite con su estado, su fecha y un enlace a su detalle', async () => {
    simularSesion(CIUDADANO, {
      ...TIPOS,
      'GET /api/tramites': () =>
        json(
          pagina([
            tramite({ id: 12 }),
            tramite({ id: 13, estado: 'ENVIADO', tipoNombre: 'Pago de IGSS' }),
          ]),
        ),
    })

    renderizarApp('/tramites')

    const tabla = await screen.findByRole('table', { name: 'Lista de trámites' })
    const filas = within(tabla).getAllByRole('row')
    expect(filas).toHaveLength(3)
    expect(within(filas[1]).getByText('#12')).toBeInTheDocument()
    expect(within(filas[1]).getByText('Borrador')).toBeInTheDocument()
    expect(within(filas[2]).getByText('Pago de IGSS')).toBeInTheDocument()
    expect(within(filas[2]).getByText('Enviado')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver el trámite 12' })).toHaveAttribute(
      'href',
      '/tramites/12',
    )
    expect(screen.getByText('Mostrando 1–2 de 2')).toBeInTheDocument()
  })

  it('lee el resumen de la paginación del objeto "page" de la API (no de la raíz de la respuesta)', async () => {
    simularSesion(CIUDADANO, {
      ...TIPOS,
      'GET /api/tramites': () =>
        json(
          pagina([tramite({ id: 21 }), tramite({ id: 22 })], {
            number: 1,
            size: 20,
            totalElements: 45,
            totalPages: 3,
          }),
        ),
    })

    renderizarApp('/tramites?page=1')

    expect(await screen.findByText('Mostrando 21–22 de 45')).toBeInTheDocument()
    expect(screen.getByText('Página 2 de 3')).toBeInTheDocument()
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument()
  })

  it('pide la página siguiente y la deja en la dirección', async () => {
    const llamadas = simularSesion(CIUDADANO, {
      ...TIPOS,
      'GET /api/tramites': () =>
        json(pagina([tramite({ id: 1 })], { number: 0, totalElements: 45, totalPages: 3 })),
    })
    renderizarApp('/tramites')
    await screen.findByRole('table')

    await userEvent.setup().click(screen.getByRole('button', { name: 'Siguiente' }))

    await vi.waitFor(() =>
      expect(llamadas.some((l) => l.ruta === '/api/tramites?page=1')).toBe(true),
    )
  })

  it('al filtrar manda el estado y el tipo elegidos y avisa cuántos resultados hay', async () => {
    const llamadas = simularSesion(CIUDADANO, {
      ...TIPOS,
      'GET /api/tramites': () => json(pagina([tramite({ id: 5, estado: 'ENVIADO' })])),
    })
    const usuario = userEvent.setup()
    renderizarApp('/tramites')
    await screen.findByRole('table')

    await usuario.selectOptions(screen.getByLabelText('Estado'), 'ENVIADO')
    await usuario.selectOptions(screen.getByLabelText('Tipo de trámite'), '1')
    await usuario.click(screen.getByRole('button', { name: 'Filtrar' }))

    expect(
      await screen.findByText(/Mostrando 1 resultado con los filtros aplicados/),
    ).toBeInTheDocument()
    expect(llamadas.some((l) => l.ruta === '/api/tramites?estado=ENVIADO&tipoId=1&page=0')).toBe(
      true,
    )
  })

  it('"Limpiar" quita los filtros y vuelve a pedir todo', async () => {
    const llamadas = simularSesion(CIUDADANO, {
      ...TIPOS,
      'GET /api/tramites': () => json(pagina([tramite()])),
    })
    const usuario = userEvent.setup()
    renderizarApp('/tramites?estado=OBSERVADO')
    await screen.findByRole('table')

    await usuario.click(screen.getByRole('button', { name: 'Limpiar' }))

    await vi.waitFor(() => expect(llamadas.at(-1)?.ruta).toBe('/api/tramites?page=0'))
    expect(screen.getByLabelText('Estado')).toHaveValue('')
  })

  it('toma los filtros y la página de la dirección, así que "atrás" y los enlaces compartidos funcionan', async () => {
    const llamadas = simularSesion(CIUDADANO, {
      ...TIPOS,
      'GET /api/tramites': () =>
        json(pagina([tramite()], { number: 1, totalPages: 2, totalElements: 21 })),
    })

    renderizarApp('/tramites?estado=OBSERVADO&page=1')

    await screen.findByRole('table')
    expect(llamadas.some((l) => l.ruta === '/api/tramites?estado=OBSERVADO&page=1')).toBe(true)
    expect(screen.getByLabelText('Estado')).toHaveValue('OBSERVADO')
  })

  it('con las fechas al revés avisa y no deja filtrar', async () => {
    const llamadas = simularSesion(CIUDADANO, {
      ...TIPOS,
      'GET /api/tramites': () => json(pagina([tramite()])),
    })
    renderizarApp('/tramites')
    await screen.findByRole('table')
    const antes = llamadas.length

    fireEvent.change(screen.getByLabelText('Creado desde'), { target: { value: '2026-10-10' } })
    fireEvent.change(screen.getByLabelText('Creado hasta'), { target: { value: '2026-10-01' } })

    expect(screen.getByText(/no puede ser posterior a la final/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filtrar' })).toBeDisabled()
    expect(llamadas.length).toBe(antes)
  })

  it('con las fechas al revés tampoco filtra si el formulario se envía por otra vía (por ejemplo con Enter)', async () => {
    const llamadas = simularSesion(CIUDADANO, {
      ...TIPOS,
      'GET /api/tramites': () => json(pagina([tramite()])),
    })
    renderizarApp('/tramites')
    await screen.findByRole('table')
    const antes = llamadas.length
    fireEvent.change(screen.getByLabelText('Creado desde'), { target: { value: '2026-10-10' } })
    fireEvent.change(screen.getByLabelText('Creado hasta'), { target: { value: '2026-10-01' } })

    fireEvent.submit(screen.getByRole('form', { name: 'Filtros' }))

    expect(llamadas.length).toBe(antes)
  })

  it.each([
    [
      'sin filtros para una persona ciudadana',
      CIUDADANO,
      '/tramites',
      'Todavía no tienes trámites',
    ],
    ['sin filtros para el personal', GESTOR, '/tramites', 'Todavía no hay trámites registrados'],
    [
      'con filtros',
      CIUDADANO,
      '/tramites?estado=RECHAZADO',
      'No hay trámites que coincidan con los filtros',
    ],
  ])(
    'cuando no hay resultados (%s) lo dice con claridad',
    async (_nombre, perfil, ruta, mensaje) => {
      simularSesion(perfil, {
        ...TIPOS,
        'GET /api/tramites': () => json(pagina([], { totalElements: 0, totalPages: 0 })),
      })

      renderizarApp(ruta)

      expect(await screen.findByText(new RegExp(mensaje))).toBeInTheDocument()
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
    },
  )

  it('ante un error del servidor muestra un aviso general y permite reintentar', async () => {
    let intentos = 0
    simularSesion(CIUDADANO, {
      ...TIPOS,
      'GET /api/tramites': () =>
        ++intentos === 1
          ? problema(500, 'java.lang.NullPointerException en TramiteService')
          : json(pagina([tramite({ id: 99 })])),
    })
    renderizarApp('/tramites')

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Error del servidor')
    expect(alerta).not.toHaveTextContent('NullPointer')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('#99')).toBeInTheDocument()
  })

  it('el botón "Nuevo trámite" solo aparece con el permiso de crear', async () => {
    simularSesion(CIUDADANO, { ...TIPOS, 'GET /api/tramites': () => json(pagina([])) })
    renderizarApp('/tramites')
    expect(await screen.findByRole('link', { name: 'Nuevo trámite' })).toHaveAttribute(
      'href',
      '/tramites/nuevo',
    )
  })

  it('el personal sin permiso de crear no ve "Nuevo trámite" y el título habla de todos', async () => {
    simularSesion(GESTOR, { ...TIPOS, 'GET /api/tramites': () => json(pagina([tramite()])) })

    renderizarApp('/tramites')

    expect(await screen.findByRole('heading', { level: 1, name: 'Trámites' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Nuevo trámite' })).not.toBeInTheDocument()
  })

  it('una persona ciudadana ve "Mis trámites"', async () => {
    simularSesion(CIUDADANO, { ...TIPOS, 'GET /api/tramites': () => json(pagina([])) })

    renderizarApp('/tramites')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mis trámites' }),
    ).toBeInTheDocument()
  })

  it('sin el permiso de leer trámites muestra "sin permiso" y no llama a la API de trámites', async () => {
    const llamadas = simularSesion({ ...CIUDADANO, permisos: [] })

    renderizarApp('/tramites')

    expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument()
    expect(llamadas.some((l) => l.ruta.startsWith('/api/tramites'))).toBe(false)
  })

  it('el menú muestra "Trámites" solo a quien puede leerlos', async () => {
    simularSesion(CIUDADANO, { ...TIPOS, 'GET /api/tramites': () => json(pagina([])) })

    renderizarApp('/panel')

    const menu = within(await screen.findByRole('navigation', { name: 'Principal' }))
    expect(await menu.findByRole('link', { name: 'Trámites' })).toHaveAttribute('href', '/tramites')
  })
})
