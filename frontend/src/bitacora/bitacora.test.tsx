import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RegistroBitacora } from '../api/bitacora'
import { json, problema, simularApi, type Llamada } from '../test/api-simulada'
import { GESTOR, pagina } from '../test/datos'
import { limpiarSesion, renderizarApp, simularSesion } from '../test/utilidades'

const AUDITOR = {
  id: 3,
  correo: 'auditor@demo.com',
  nombre: 'Aldo Auditor',
  roles: ['AUDITOR'],
  permisos: ['bitacora:leer', 'tramite:leer'],
  alcanceTotal: true,
}

function registro(extra: Partial<RegistroBitacora> = {}): RegistroBitacora {
  return {
    id: 15,
    actorId: 4,
    actorCorreo: 'a***@novagest.test',
    accion: 'EDITAR_TIPO_TRAMITE',
    recurso: 'tipo_tramite',
    recursoId: 5,
    antes: { nombre: 'Tipo viejo', activo: true, monto: 2 },
    despues: { nombre: 'Tipo nuevo', activo: false, monto: 22.5 },
    ip: '203.0.113.9',
    fecha: '2026-10-22T23:50:00Z',
    ...extra,
  }
}

const REGISTROS = [
  registro(),
  registro({
    id: 14,
    actorId: null,
    actorCorreo: null,
    accion: 'BLOQUEO_CUENTA',
    recurso: 'usuario',
    recursoId: 6,
    antes: { intentosFallidos: 4 },
    despues: { bloqueadoHasta: '2026-10-23T00:05:00Z' },
    ip: null,
  }),
  registro({
    id: 13,
    accion: 'CONSULTA_BITACORA',
    recurso: 'bitacora',
    recursoId: null,
    antes: null,
    despues: { recurso: 'pago' },
  }),
  registro({
    id: 12,
    accion: 'CONSULTA_BITACORA',
    recurso: 'bitacora',
    recursoId: null,
    antes: null,
    despues: null,
  }),
]

const LISTA = { 'GET /api/bitacora': () => json(pagina(REGISTROS)) }

function consultas(llamadas: Llamada[]): URLSearchParams[] {
  return llamadas
    .filter((l) => l.metodo === 'GET' && l.ruta.startsWith('/api/bitacora'))
    .map((l) => new URL(l.ruta, 'http://localhost').searchParams)
}

beforeEach(() => limpiarSesion())
afterEach(() => vi.unstubAllGlobals())

describe('lista de la bitácora', () => {
  it('muestra fecha en hora de Guatemala, persona, acción, recurso, IP y detalle de cada registro', async () => {
    simularSesion(AUDITOR, LISTA)

    renderizarApp('/bitacora')

    const tabla = await screen.findByRole('table', { name: 'Registros de la bitácora' })
    const filas = within(tabla).getAllByRole('row')
    expect(filas).toHaveLength(5)
    const primera = within(filas[1])
    expect(primera.getByText(/22\/10\/2026.*5:50/)).toBeInTheDocument()
    expect(primera.getByRole('link', { name: 'Ver las acciones del usuario 4' })).toHaveTextContent(
      '#4 · a***@novagest.test',
    )
    expect(primera.getByText('Tipo de trámite editado')).toBeInTheDocument()
    expect(primera.getByText('Tipos de trámite #5')).toBeInTheDocument()
    expect(primera.getByText('203.0.113.9')).toBeInTheDocument()
  })

  it('una acción hecha por el sistema se llama "Sistema", sin enlace, y una IP vacía se muestra como guion', async () => {
    simularSesion(AUDITOR, LISTA)

    renderizarApp('/bitacora')

    const filas = within(
      await screen.findByRole('table', { name: 'Registros de la bitácora' }),
    ).getAllByRole('row')
    const sistema = within(filas[2])
    expect(sistema.getByText('Sistema')).toBeInTheDocument()
    expect(sistema.queryByRole('link', { name: /Ver las acciones/ })).not.toBeInTheDocument()
    expect(sistema.getByText('Cuenta bloqueada por intentos fallidos')).toBeInTheDocument()
    expect(sistema.getByText('—', { selector: 'td' })).toBeInTheDocument()
  })

  it('un registro sin recurso afectado no muestra número, y el correo nunca se completa', async () => {
    simularSesion(AUDITOR, LISTA)

    renderizarApp('/bitacora')

    const filas = within(
      await screen.findByRole('table', { name: 'Registros de la bitácora' }),
    ).getAllByRole('row')
    expect(within(filas[3]).getByText('Bitácora')).toBeInTheDocument()
    for (const celda of screen.getAllByText(/@novagest\.test/)) {
      expect(celda.textContent).toContain('***')
    }
  })

  it('un código de acción o de recurso que la pantalla no conoce se muestra tal cual, sin ocultarlo', async () => {
    simularSesion(AUDITOR, {
      'GET /api/bitacora': () =>
        json(pagina([registro({ accion: 'ACCION_NUEVA', recurso: 'recurso_nuevo' })])),
    })

    renderizarApp('/bitacora')

    expect(await screen.findByText('ACCION_NUEVA')).toBeInTheDocument()
    expect(screen.getByText('recurso_nuevo #5')).toBeInTheDocument()
  })

  it('avisa que la consulta queda registrada', async () => {
    simularSesion(AUDITOR, LISTA)

    renderizarApp('/bitacora')

    expect(await screen.findByText(/queda registrada/)).toBeInTheDocument()
  })

  it('sin filtros pide la primera página sin ningún filtro', async () => {
    const llamadas = simularSesion(AUDITOR, LISTA)

    renderizarApp('/bitacora')

    await screen.findByRole('table', { name: 'Registros de la bitácora' })
    const [consulta] = consultas(llamadas)
    expect(Object.fromEntries(consulta)).toEqual({ page: '0' })
  })

  it('sin registros lo dice, y con filtros dice que no hay con esos filtros', async () => {
    simularSesion(AUDITOR, { 'GET /api/bitacora': () => json(pagina([])) })
    const { unmount } = renderizarApp('/bitacora')
    expect(await screen.findByText('La bitácora todavía no tiene registros.')).toBeInTheDocument()
    unmount()

    limpiarSesion()
    vi.unstubAllGlobals()
    simularSesion(AUDITOR, { 'GET /api/bitacora': () => json(pagina([])) })
    renderizarApp('/bitacora?recurso=pago')
    expect(await screen.findByText('No hay registros con esos filtros.')).toBeInTheDocument()
  })

  it('si la consulta falla muestra el error general (nunca el detalle del servidor) y deja reintentar', async () => {
    const usuario = userEvent.setup()
    let intentos = 0
    simularSesion(AUDITOR, {
      'GET /api/bitacora': () =>
        ++intentos === 1 ? problema(500, 'detalle interno') : json(pagina(REGISTROS)),
    })

    renderizarApp('/bitacora')

    expect(await screen.findByRole('alert')).toHaveTextContent(/error inesperado/)
    expect(screen.queryByText('detalle interno')).not.toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }))
    const tabla = await screen.findByRole('table', { name: 'Registros de la bitácora' })
    expect(within(tabla).getByText('Tipo de trámite editado')).toBeInTheDocument()
  })

  it('si la API niega el permiso lo muestra', async () => {
    simularSesion(AUDITOR, {
      'GET /api/bitacora': () => problema(403, 'No tienes permiso para hacer esto.'),
    })

    renderizarApp('/bitacora')

    expect(await screen.findByRole('alert')).toHaveTextContent(/No tienes permiso/)
  })
})

describe('detalle de cada registro', () => {
  it('despliega el antes y el después, con Sí/No y los números tal cual', async () => {
    const usuario = userEvent.setup()
    simularSesion(AUDITOR, LISTA)

    renderizarApp('/bitacora')
    await usuario.click(await screen.findByLabelText('Ver los cambios del registro 15'))

    const detalle = screen.getByLabelText('Ver los cambios del registro 15').closest('details')!
    expect(detalle).toHaveAttribute('open')
    const antes = within(within(detalle).getByRole('heading', { name: 'Antes' }).parentElement!)
    const despues = within(within(detalle).getByRole('heading', { name: 'Después' }).parentElement!)
    expect(antes.getByText('Tipo viejo')).toBeInTheDocument()
    expect(antes.getByText('Sí')).toBeInTheDocument()
    expect(despues.getByText('Tipo nuevo')).toBeInTheDocument()
    expect(despues.getByText('No')).toBeInTheDocument()
    expect(despues.getByText('22.5')).toBeInTheDocument()
  })

  it('un registro sin "antes" dice que no hay datos de ese lado', async () => {
    const usuario = userEvent.setup()
    simularSesion(AUDITOR, LISTA)

    renderizarApp('/bitacora')
    await usuario.click(await screen.findByLabelText('Ver los cambios del registro 13'))

    const detalle = screen.getByLabelText('Ver los cambios del registro 13').closest('details')!
    expect(
      within(within(detalle).getByRole('heading', { name: 'Antes' }).parentElement!).getByText(
        'Sin datos.',
      ),
    ).toBeInTheDocument()
  })

  it('un registro sin datos de ninguno de los dos lados no ofrece desplegar nada', async () => {
    simularSesion(AUDITOR, LISTA)

    renderizarApp('/bitacora')

    await screen.findByRole('table', { name: 'Registros de la bitácora' })
    expect(screen.queryByLabelText('Ver los cambios del registro 12')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Sin cambios registrados')).toBeInTheDocument()
  })

  it('los valores se muestran como texto: un nombre con HTML no se convierte en elementos', async () => {
    const usuario = userEvent.setup()
    simularSesion(AUDITOR, {
      'GET /api/bitacora': () =>
        json(
          pagina([
            registro({ despues: { nombre: '<img src=x onerror=alert(1)> <b>negrita</b>' } }),
          ]),
        ),
    })

    renderizarApp('/bitacora')
    await usuario.click(await screen.findByLabelText('Ver los cambios del registro 15'))

    expect(screen.getByText('<img src=x onerror=alert(1)> <b>negrita</b>')).toBeInTheDocument()
    expect(document.querySelector('main img')).toBeNull()
    expect(document.querySelector('main b')).toBeNull()
  })
})

describe('filtros', () => {
  it('filtrar manda todos los filtros a la API y los deja en la dirección', async () => {
    const usuario = userEvent.setup()
    const llamadas = simularSesion(AUDITOR, LISTA)

    renderizarApp('/bitacora')
    await screen.findByRole('table', { name: 'Registros de la bitácora' })
    await usuario.selectOptions(screen.getByLabelText('Recurso'), 'Pagos')
    await usuario.selectOptions(screen.getByLabelText('Acción'), 'Pago validado')
    await usuario.type(screen.getByLabelText('Usuario (número)'), '3')
    await usuario.type(screen.getByLabelText('Registro afectado (número)'), '12')
    await usuario.type(screen.getByLabelText('Desde'), '2026-10-01')
    await usuario.type(screen.getByLabelText('Hasta (incluida)'), '2026-10-22')
    await usuario.click(screen.getByRole('button', { name: 'Filtrar' }))

    await vi.waitFor(() => {
      expect(Object.fromEntries(consultas(llamadas).at(-1)!)).toEqual({
        recurso: 'pago',
        accion: 'VALIDACION_PAGO',
        actorId: '3',
        recursoId: '12',
        desde: '2026-10-01',
        hasta: '2026-10-22',
        page: '0',
      })
    })
    expect(screen.getByText(/Mostrando 4 registros con los filtros aplicados/)).toBeInTheDocument()
  })

  it('entrar con filtros en la dirección pide justo eso y los muestra en el formulario', async () => {
    const llamadas = simularSesion(AUDITOR, LISTA)

    renderizarApp(
      '/bitacora?recurso=usuario&accion=BLOQUEO_CUENTA&actorId=7&desde=2026-10-05&page=1',
    )

    await screen.findByRole('table', { name: 'Registros de la bitácora' })
    expect(Object.fromEntries(consultas(llamadas)[0])).toEqual({
      recurso: 'usuario',
      accion: 'BLOQUEO_CUENTA',
      actorId: '7',
      desde: '2026-10-05',
      page: '1',
    })
    expect(screen.getByLabelText('Recurso')).toHaveValue('usuario')
    expect(screen.getByLabelText('Acción')).toHaveValue('BLOQUEO_CUENTA')
    expect(screen.getByLabelText('Usuario (número)')).toHaveValue('7')
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-10-05')
  })

  it('al filtrar vuelve a la primera página', async () => {
    const usuario = userEvent.setup()
    const llamadas = simularSesion(AUDITOR, LISTA)

    renderizarApp('/bitacora?page=3')
    await screen.findByRole('table', { name: 'Registros de la bitácora' })
    await usuario.selectOptions(screen.getByLabelText('Recurso'), 'Pagos')
    await usuario.click(screen.getByRole('button', { name: 'Filtrar' }))

    await vi.waitFor(() => expect(consultas(llamadas).at(-1)!.get('recurso')).toBe('pago'))
    expect(consultas(llamadas).at(-1)!.get('page')).toBe('0')
  })

  it('un número mal escrito se señala al filtrar y no se hace ninguna consulta nueva', async () => {
    const usuario = userEvent.setup()
    const llamadas = simularSesion(AUDITOR, LISTA)

    renderizarApp('/bitacora')
    await screen.findByRole('table', { name: 'Registros de la bitácora' })
    const antes = consultas(llamadas).length
    await usuario.type(screen.getByLabelText('Usuario (número)'), 'abc')
    await usuario.type(screen.getByLabelText('Registro afectado (número)'), '-4')
    await usuario.click(screen.getByRole('button', { name: 'Filtrar' }))

    expect(
      screen.getByText('Escribe el número de usuario (un entero positivo).'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Escribe el número del registro (un entero positivo).'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Usuario (número)')).toHaveAttribute('aria-invalid', 'true')
    expect(consultas(llamadas)).toHaveLength(antes)
    // Los errores se muestran junto al campo y los datos siguen a la vista: no se cambió la dirección
    expect(screen.getByRole('table', { name: 'Registros de la bitácora' })).toBeInTheDocument()
    expect(screen.queryByText('Corrige los filtros')).not.toBeInTheDocument()
  })

  it('un error no aparece mientras se escribe, solo al filtrar', async () => {
    const usuario = userEvent.setup()
    simularSesion(AUDITOR, LISTA)

    renderizarApp('/bitacora')
    await screen.findByRole('table', { name: 'Registros de la bitácora' })
    await usuario.type(screen.getByLabelText('Usuario (número)'), 'abc')

    expect(
      screen.queryByText('Escribe el número de usuario (un entero positivo).'),
    ).not.toBeInTheDocument()
  })

  it('"desde" posterior a "hasta" se señala y no se consulta', async () => {
    const usuario = userEvent.setup()
    const llamadas = simularSesion(AUDITOR, LISTA)

    renderizarApp('/bitacora')
    await screen.findByRole('table', { name: 'Registros de la bitácora' })
    const antes = consultas(llamadas).length
    await usuario.type(screen.getByLabelText('Desde'), '2026-10-30')
    await usuario.type(screen.getByLabelText('Hasta (incluida)'), '2026-10-01')
    await usuario.click(screen.getByRole('button', { name: 'Filtrar' }))

    expect(
      screen.getByText('La fecha inicial no puede ser posterior a la final.'),
    ).toBeInTheDocument()
    expect(consultas(llamadas)).toHaveLength(antes)
    // Los errores se muestran junto al campo y los datos siguen a la vista: no se cambió la dirección
    expect(screen.getByRole('table', { name: 'Registros de la bitácora' })).toBeInTheDocument()
    expect(screen.queryByText('Corrige los filtros')).not.toBeInTheDocument()
  })

  it('una dirección con filtros inválidos no consulta, muestra los errores y no enseña datos sin filtrar', async () => {
    const llamadas = simularSesion(AUDITOR, LISTA)

    renderizarApp('/bitacora?actorId=abc&desde=2026-10-30&hasta=2026-10-01')

    expect(await screen.findByText('Corrige los filtros')).toBeInTheDocument()
    expect(
      screen.getByText('Escribe el número de usuario (un entero positivo).'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('La fecha inicial no puede ser posterior a la final.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(consultas(llamadas)).toHaveLength(0)
  })

  it('"Limpiar" quita todos los filtros y vuelve a consultar sin ellos', async () => {
    const usuario = userEvent.setup()
    const llamadas = simularSesion(AUDITOR, LISTA)

    renderizarApp('/bitacora?recurso=pago&actorId=3')
    await screen.findByRole('table', { name: 'Registros de la bitácora' })
    await usuario.click(screen.getByRole('button', { name: 'Limpiar' }))

    await vi.waitFor(() =>
      expect(Object.fromEntries(consultas(llamadas).at(-1)!)).toEqual({ page: '0' }),
    )
    expect(screen.getByLabelText('Recurso')).toHaveValue('')
    expect(screen.getByLabelText('Usuario (número)')).toHaveValue('')
    expect(screen.queryByText(/con los filtros aplicados/)).not.toBeInTheDocument()
  })

  it('un código de acción desconocido en la dirección se puede ver y quitar del filtro', async () => {
    simularSesion(AUDITOR, LISTA)

    renderizarApp('/bitacora?accion=ACCION_NUEVA')

    await screen.findByRole('table', { name: 'Registros de la bitácora' })
    const filtro = screen.getByLabelText('Acción') as HTMLSelectElement
    expect(filtro).toHaveValue('ACCION_NUEVA')
    expect(within(filtro).getByRole('option', { name: 'ACCION_NUEVA' })).toBeInTheDocument()
  })

  it('el enlace de una persona filtra por ella y el formulario refleja el número', async () => {
    const usuario = userEvent.setup()
    const llamadas = simularSesion(AUDITOR, LISTA)

    renderizarApp('/bitacora?recurso=pago&page=2')
    const [enlace] = await screen.findAllByRole('link', { name: 'Ver las acciones del usuario 4' })
    expect(enlace).toHaveAttribute('href', '/bitacora?actorId=4')
    await usuario.click(enlace)

    await vi.waitFor(() =>
      expect(Object.fromEntries(consultas(llamadas).at(-1)!)).toEqual({ actorId: '4', page: '0' }),
    )
    expect(screen.getByLabelText('Usuario (número)')).toHaveValue('4')
    expect(screen.getByLabelText('Recurso')).toHaveValue('')
  })

  it('el resumen de resultados concuerda en singular y plural', async () => {
    simularSesion(AUDITOR, { 'GET /api/bitacora': () => json(pagina([registro()])) })
    const { unmount } = renderizarApp('/bitacora?recurso=tipo_tramite')
    expect(
      await screen.findByText('Mostrando 1 registro con los filtros aplicados.'),
    ).toBeInTheDocument()
    unmount()

    limpiarSesion()
    vi.unstubAllGlobals()
    simularSesion(AUDITOR, LISTA)
    renderizarApp('/bitacora?recurso=tipo_tramite')
    expect(
      await screen.findByText('Mostrando 4 registros con los filtros aplicados.'),
    ).toBeInTheDocument()
  })
})

describe('paginación', () => {
  it('pide la página siguiente al servidor y la deja en la dirección', async () => {
    const usuario = userEvent.setup()
    const llamadas = simularSesion(AUDITOR, {
      'GET /api/bitacora': (llamada) =>
        json(
          pagina(REGISTROS, {
            number: Number(new URL(llamada.ruta, 'http://localhost').searchParams.get('page')),
            totalElements: 45,
            totalPages: 3,
          }),
        ),
    })

    renderizarApp('/bitacora')
    await screen.findByText('Mostrando 1–4 de 45')
    await usuario.click(screen.getByRole('button', { name: 'Siguiente' }))

    await vi.waitFor(() => expect(consultas(llamadas).at(-1)!.get('page')).toBe('1'))
    expect(await screen.findByText('Página 2 de 3')).toBeInTheDocument()
  })

  it('cambiar de página conserva los filtros', async () => {
    const usuario = userEvent.setup()
    const llamadas = simularSesion(AUDITOR, {
      'GET /api/bitacora': () => json(pagina(REGISTROS, { totalElements: 45, totalPages: 3 })),
    })

    renderizarApp('/bitacora?recurso=pago&actorId=3')
    await screen.findByText('Mostrando 1–4 de 45')
    await usuario.click(screen.getByRole('button', { name: 'Siguiente' }))

    await vi.waitFor(() =>
      expect(Object.fromEntries(consultas(llamadas).at(-1)!)).toEqual({
        recurso: 'pago',
        actorId: '3',
        page: '1',
      }),
    )
  })
})

describe('permisos', () => {
  it.each([
    ['el gestor', GESTOR],
    [
      'una persona sin permisos de auditoría',
      { ...AUDITOR, permisos: ['tramite:leer', 'usuario:leer'] },
    ],
  ])('%s ve "Sin permiso" y no se llama a la API', async (_nombre, perfil) => {
    const llamadas = simularSesion(perfil, LISTA)

    renderizarApp('/bitacora')

    expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument()
    expect(consultas(llamadas)).toHaveLength(0)
  })

  it('el menú muestra "Bitácora" solo a quien tiene bitacora:leer', async () => {
    simularSesion(AUDITOR, LISTA)
    const { unmount } = renderizarApp('/panel')
    const menu = await screen.findByRole('navigation', { name: /principal/i })
    expect(within(menu).getByRole('link', { name: 'Bitácora' })).toHaveAttribute(
      'href',
      '/bitacora',
    )
    unmount()

    limpiarSesion()
    vi.unstubAllGlobals()
    simularSesion(GESTOR, LISTA)
    renderizarApp('/panel')
    const menuGestor = await screen.findByRole('navigation', { name: /principal/i })
    expect(within(menuGestor).queryByRole('link', { name: 'Bitácora' })).not.toBeInTheDocument()
  })

  it('sin sesión lleva a iniciar sesión y no se llama a la API', async () => {
    // No hay token de renovación guardado: la persona no ha iniciado sesión
    const llamadas = simularApi(LISTA)

    renderizarApp('/bitacora')

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(consultas(llamadas)).toHaveLength(0)
  })
})
