import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tramite } from '../api/tramites'
import { json, PERFIL_CIUDADANA, problema, type Llamada } from '../test/api-simulada'
import { accion, GESTOR, HISTORIAL, pagina, TIPO_ORNATO, tramite } from '../test/datos'
import { limpiarSesion, renderizarApp, simularSesion } from '../test/utilidades'

const consulta = (ruta: string) => new URL(ruta, 'http://prueba').searchParams

/** Trámites por estado. Responde como la API: filtra por estado, ordena y pagina con `page` y `size`. */
function apiTramites(porEstado: Record<string, Tramite[]>) {
  return (llamada: Llamada) => {
    const p = consulta(llamada.ruta)
    const estados = (p.get('estado') ?? '').split(',').filter(Boolean)
    const todos = estados.flatMap((e) => porEstado[e] ?? [])
    const size = Number(p.get('size') ?? 20)
    const page = Number(p.get('page') ?? 0)
    return json(
      pagina(todos.slice(page * size, page * size + size), {
        number: page,
        size,
        totalElements: todos.length,
        totalPages: Math.max(1, Math.ceil(todos.length / size)),
      }),
    )
  }
}

const COLA: Record<string, Tramite[]> = {
  ENVIADO: [
    tramite({ id: 2, estado: 'ENVIADO' }),
    tramite({ id: 3, estado: 'ENVIADO', tipoNombre: 'Pago de IGSS' }),
  ],
  EN_REVISION: [tramite({ id: 4, estado: 'EN_REVISION', gestorId: 3 })],
  POR_PAGAR: [tramite({ id: 5, estado: 'POR_PAGAR', gestorId: 9 })],
  OBSERVADO: [tramite({ id: 6, estado: 'OBSERVADO' })],
}

const RUTAS = { 'GET /api/tramites': apiTramites(COLA) }

/** Las consultas de la lista (no las de conteo, que piden una sola fila). */
const deLista = (llamadas: Llamada[]) =>
  llamadas.filter(
    (l) => l.ruta.startsWith('/api/tramites?') && consulta(l.ruta).get('size') === null,
  )

beforeEach(() => limpiarSesion())
afterEach(() => vi.unstubAllGlobals())

describe('bandeja del personal', () => {
  it('muestra por defecto lo pendiente de atención, con los más antiguos primero', async () => {
    const llamadas = simularSesion(GESTOR, RUTAS)

    renderizarApp('/bandeja')

    const tabla = await screen.findByRole('table')
    expect(within(tabla).getAllByRole('row')).toHaveLength(5)
    const consultaLista = consulta(deLista(llamadas)[0].ruta)
    expect(consultaLista.get('estado')).toBe('ENVIADO,EN_REVISION,POR_PAGAR')
    expect(consultaLista.get('sort')).toBe('creadoEn,asc')
    expect(screen.getByText(/Los más antiguos primero/)).toBeInTheDocument()
    expect(screen.queryByText('#6')).not.toBeInTheDocument()
  })

  it('cuenta cuántos hay en cada cola, y "pendientes" suma solo las que esperan al personal', async () => {
    simularSesion(GESTOR, RUTAS)

    renderizarApp('/bandeja')

    const colas = within(await screen.findByRole('navigation', { name: 'Colas de trabajo' }))
    expect(await colas.findByRole('link', { name: /Por tomar\s*2/ })).toBeInTheDocument()
    expect(colas.getByRole('link', { name: /En revisión\s*1/ })).toBeInTheDocument()
    expect(colas.getByRole('link', { name: /Esperando pago\s*1/ })).toBeInTheDocument()
    expect(colas.getByRole('link', { name: /Observados\s*1/ })).toBeInTheDocument()
    // 2 + 1 + 1: los observados esperan a la persona, no al personal
    expect(colas.getByRole('link', { name: /Pendientes de atención\s*4/ })).toBeInTheDocument()
  })

  it('cuenta con una consulta de una sola fila por cola, y toma el total del objeto "page"', async () => {
    const llamadas = simularSesion(GESTOR, RUTAS)

    renderizarApp('/bandeja')
    await screen.findByRole('link', { name: /Por tomars*2/ })

    const conteos = llamadas.filter((l) => consulta(l.ruta).get('size') === '1')
    const estados = new Set(conteos.map((l) => consulta(l.ruta).get('estado')))
    expect(estados).toEqual(new Set(['ENVIADO', 'EN_REVISION', 'POR_PAGAR', 'OBSERVADO']))
  })

  it('al elegir una cola muestra solo sus trámites y la marca como activa', async () => {
    const llamadas = simularSesion(GESTOR, RUTAS)
    renderizarApp('/bandeja')
    await screen.findByRole('table')

    await userEvent.setup().click(await screen.findByRole('link', { name: /Por tomar/ }))

    await vi.waitFor(() =>
      expect(deLista(llamadas).some((l) => consulta(l.ruta).get('estado') === 'ENVIADO')).toBe(
        true,
      ),
    )
    const activa = screen.getByRole('link', { name: /Por tomar/ })
    expect(activa).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /En revisión/ })).not.toHaveAttribute('aria-current')
    expect(await screen.findByText('#3')).toBeInTheDocument()
    expect(screen.queryByText('#4')).not.toBeInTheDocument()
    expect(screen.getByText(/Enviados que nadie ha tomado/)).toBeInTheDocument()
  })

  it('una cola que no existe en la dirección cae en los pendientes', async () => {
    simularSesion(GESTOR, RUTAS)

    renderizarApp('/bandeja?cola=inventada')

    await screen.findByRole('table')
    expect(screen.getByRole('link', { name: /Pendientes de atención/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('indica a quién está asignado cada trámite', async () => {
    simularSesion(GESTOR, RUTAS)

    renderizarApp('/bandeja')

    const filas = within(await screen.findByRole('table')).getAllByRole('row')
    expect(within(filas[1]).getByText('Sin asignar')).toBeInTheDocument()
    expect(within(filas[3]).getByText('Tú')).toBeInTheDocument()
    expect(within(filas[4]).getByText('Usuario #9')).toBeInTheDocument()
  })

  it('pagina con la numeración de la API y reinicia la página al cambiar de cola', async () => {
    const muchos = Array.from({ length: 45 }, (_, i) => tramite({ id: 100 + i, estado: 'ENVIADO' }))
    const llamadas = simularSesion(GESTOR, {
      'GET /api/tramites': apiTramites({ ENVIADO: muchos }),
    })
    renderizarApp('/bandeja?cola=por-tomar')
    await screen.findByRole('table')
    const usuario = userEvent.setup()

    await usuario.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText('Mostrando 21–40 de 45')).toBeInTheDocument()
    expect(deLista(llamadas).some((l) => consulta(l.ruta).get('page') === '1')).toBe(true)

    await usuario.click(screen.getByRole('link', { name: /En revisión/ }))
    await vi.waitFor(() =>
      expect(
        deLista(llamadas).some(
          (l) =>
            consulta(l.ruta).get('estado') === 'EN_REVISION' &&
            consulta(l.ruta).get('page') === '0',
        ),
      ).toBe(true),
    )
  })

  it('una bandeja vacía lo celebra y una cola vacía lo dice', async () => {
    simularSesion(GESTOR, { 'GET /api/tramites': apiTramites({}) })
    renderizarApp('/bandeja')
    expect(await screen.findByText(/Bandeja al día/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('una cola vacía lo dice con su nombre', async () => {
    simularSesion(GESTOR, { 'GET /api/tramites': apiTramites({ EN_REVISION: COLA.EN_REVISION }) })

    renderizarApp('/bandeja?cola=por-tomar')

    expect(await screen.findByText('No hay trámites en "Por tomar".')).toBeInTheDocument()
  })

  it('si falla la lista avisa sin detalles internos y permite reintentar', async () => {
    let intentos = 0
    simularSesion(GESTOR, {
      'GET /api/tramites': (llamada) =>
        consulta(llamada.ruta).get('size') === null && ++intentos === 1
          ? problema(500, 'java.lang.NullPointerException')
          : apiTramites(COLA)(llamada),
    })
    renderizarApp('/bandeja')

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Error del servidor')
    expect(alerta).not.toHaveTextContent('NullPointer')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('si fallan los conteos la lista sigue funcionando, solo sin números', async () => {
    simularSesion(GESTOR, {
      'GET /api/tramites': (llamada) =>
        consulta(llamada.ruta).get('size') === '1'
          ? problema(500, 'x')
          : apiTramites(COLA)(llamada),
    })

    renderizarApp('/bandeja')

    expect(await screen.findByRole('table')).toBeInTheDocument()
    const enlace = screen.getByRole('link', { name: /Por tomar/ })
    expect(enlace).toHaveTextContent(/^Por tomar$/)
  })
})

describe('bandeja: quién puede verla', () => {
  it('una persona ciudadana ve "sin permiso", no se consultan trámites y el menú no ofrece la bandeja', async () => {
    const llamadas = simularSesion(
      { ...PERFIL_CIUDADANA, permisos: ['tramite:leer', 'tramite:crear'] },
      RUTAS,
    )

    renderizarApp('/bandeja')

    expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument()
    expect(llamadas.some((l) => l.ruta.startsWith('/api/tramites'))).toBe(false)
    const menu = within(screen.getByRole('navigation', { name: 'Principal' }))
    expect(menu.queryByRole('link', { name: 'Bandeja' })).not.toBeInTheDocument()
  })

  it('el personal con alcance total ve la bandeja en el menú', async () => {
    simularSesion(GESTOR, RUTAS)

    renderizarApp('/panel')

    const menu = within(await screen.findByRole('navigation', { name: 'Principal' }))
    expect(await menu.findByRole('link', { name: 'Bandeja' })).toHaveAttribute('href', '/bandeja')
  })

  it('con alcance total pero sin permiso de leer trámites tampoco', async () => {
    simularSesion({ ...GESTOR, permisos: ['pago:leer'] }, RUTAS)

    renderizarApp('/bandeja')

    expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument()
  })
})

describe('volver desde el detalle al lugar de origen', () => {
  const detalle = {
    'GET /api/tramites/12': () => json(tramite({ estado: 'ENVIADO' })),
    'GET /api/tipos-tramite/1': () => json(TIPO_ORNATO),
    'GET /api/tramites/12/historial': () => json(HISTORIAL),
    'GET /api/tramites/12/transiciones': () => json([accion()]),
  }

  it('desde la bandeja, "Abrir" lleva al detalle y el enlace de regreso vuelve a la misma cola', async () => {
    simularSesion(GESTOR, {
      ...RUTAS,
      ...detalle,
      'GET /api/tramites/2': () => json(tramite({ id: 2 })),
    })
    renderizarApp('/bandeja?cola=por-tomar')
    await screen.findByRole('table')

    await userEvent.setup().click(await screen.findByRole('link', { name: 'Abrir el trámite 2' }))

    const volver = await screen.findByRole('link', { name: '← Volver a la bandeja' })
    expect(volver).toHaveAttribute('href', '/bandeja?cola=por-tomar')
  })

  it('al abrir un trámite desde la lista filtrada, el regreso conserva los filtros', async () => {
    simularSesion(GESTOR, {
      ...RUTAS,
      ...detalle,
      'GET /api/tipos-tramite': () => json(pagina([TIPO_ORNATO])),
      'GET /api/tramites/2': () => json(tramite({ id: 2, estado: 'ENVIADO' })),
      'GET /api/tramites/2/historial': () => json(HISTORIAL),
      'GET /api/tramites/2/transiciones': () => json([]),
    })
    renderizarApp('/tramites?estado=ENVIADO')

    await userEvent.setup().click(await screen.findByRole('link', { name: 'Ver el trámite 2' }))

    const volver = await screen.findByRole('link', { name: '← Volver a los trámites' })
    expect(volver).toHaveAttribute('href', '/tramites?estado=ENVIADO')
  })

  it('desde la lista de trámites, vuelve a la lista con sus filtros', async () => {
    simularSesion(GESTOR, { ...RUTAS, ...detalle })

    renderizarApp({ pathname: '/tramites/12', state: { desde: '/tramites?estado=ENVIADO&page=1' } })

    const volver = await screen.findByRole('link', { name: '← Volver a los trámites' })
    expect(volver).toHaveAttribute('href', '/tramites?estado=ENVIADO&page=1')
  })

  it('sin origen conocido vuelve a la lista de trámites', async () => {
    simularSesion(GESTOR, { ...RUTAS, ...detalle })

    renderizarApp('/tramites/12')

    expect(await screen.findByRole('link', { name: '← Volver a los trámites' })).toHaveAttribute(
      'href',
      '/tramites',
    )
  })

  it.each(['//sitio-ajeno.example', 'https://sitio-ajeno.example', 'javascript:alert(1)', 42])(
    'un origen que no es una ruta interna (%s) se ignora',
    async (desde) => {
      simularSesion(GESTOR, { ...RUTAS, ...detalle })

      renderizarApp({ pathname: '/tramites/12', state: { desde } })

      expect(await screen.findByRole('link', { name: '← Volver a los trámites' })).toHaveAttribute(
        'href',
        '/tramites',
      )
    },
  )
})
