import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ingreso, Moneda, Proyeccion, TipoCambio } from '../api/ingresos'
import type { Perfil } from '../api/tipos'
import { json, problema, type Llamada } from '../test/api-simulada'
import { pagina } from '../test/datos'
import { limpiarSesion, renderizarApp, simularSesion } from '../test/utilidades'

const CIUDADANA: Perfil = {
  id: 7,
  correo: 'ana@demo.com',
  nombre: 'Ana López',
  roles: ['CIUDADANO'],
  permisos: ['ingreso:leer', 'ingreso:crear', 'ingreso:editar', 'ingreso:eliminar'],
  alcanceTotal: false,
}

const SOLO_LEER: Perfil = { ...CIUDADANA, permisos: ['ingreso:leer'] }

const AUDITOR: Perfil = {
  ...CIUDADANA,
  id: 3,
  nombre: 'Aurora Auditora',
  roles: ['AUDITOR'],
  permisos: ['bitacora:leer', 'tramite:leer'],
  alcanceTotal: true,
}

function ingreso(extra: Partial<Ingreso> = {}): Ingreso {
  return {
    id: 5,
    fecha: '2026-10-01',
    montoGtq: 4500.5,
    descripcion: 'Salario de septiembre',
    creadoEn: '2026-10-01T15:00:00Z',
    actualizadoEn: '2026-10-01T15:00:00Z',
    ...extra,
  }
}

const INGRESOS = [
  ingreso(),
  ingreso({ id: 6, fecha: '2026-09-15', montoGtq: 300, descripcion: null }),
]
const LISTA = { 'GET /api/ingresos': () => json(pagina(INGRESOS)) }

const MONEDAS: Moneda[] = [
  {
    codigo: 'USD',
    nombre: 'Dolar estadounidense',
    codigoBanguat: 2,
    convencion: 'QUETZALES_POR_DOLAR',
  },
  { codigo: 'EUR', nombre: 'Euro', codigoBanguat: 24, convencion: 'DOLARES_POR_UNIDAD' },
  { codigo: 'MXN', nombre: 'Peso mexicano', codigoBanguat: 18, convencion: 'UNIDADES_POR_DOLAR' },
]

function proyeccion(extra: Partial<Proyeccion> = {}): Proyeccion {
  return {
    moneda: 'EUR',
    nombreMoneda: 'Euro',
    desde: null,
    hasta: null,
    cantidadIngresos: 2,
    totalGtq: 4800.5,
    totalEnMoneda: 532.17,
    fechaSolicitada: '2026-10-20',
    quetzalesPorDolar: 7.71234,
    fechaDolar: '2026-10-20',
    valorMoneda: 1.169876,
    fechaMoneda: '2026-10-19',
    convencion: 'DOLARES_POR_UNIDAD',
    fuente: 'BANGUAT',
    estimado: false,
    ...extra,
  }
}

function tipoCambio(extra: Partial<TipoCambio> = {}): TipoCambio {
  return {
    moneda: 'USD',
    fechaSolicitada: '2026-10-20',
    fecha: '2026-10-20',
    valor: 7.71234,
    convencion: 'QUETZALES_POR_DOLAR',
    fuente: 'BANGUAT',
    estimado: false,
    ...extra,
  }
}

function llamadasA(llamadas: Llamada[], metodo: string, ruta: string): Llamada[] {
  return llamadas.filter((l) => l.metodo === metodo && l.ruta.split('?')[0] === ruta)
}

beforeEach(() => limpiarSesion())
afterEach(() => vi.unstubAllGlobals())

describe('mis ingresos', () => {
  it('muestra fecha, descripción y monto, del más reciente al más antiguo', async () => {
    const llamadas = simularSesion(CIUDADANA, LISTA)

    renderizarApp('/ingresos')

    const tabla = await screen.findByRole('table', { name: 'Mis ingresos' })
    const filas = within(tabla).getAllByRole('row')
    expect(filas).toHaveLength(3)
    expect(within(filas[1]).getByText('Salario de septiembre')).toBeInTheDocument()
    expect(within(filas[1]).getByText(/Q\s?4,500\.50/)).toBeInTheDocument()
    expect(within(filas[2]).getByText('—')).toBeInTheDocument()
    const ruta = llamadasA(llamadas, 'GET', '/api/ingresos')[0].ruta
    expect(ruta).toMatch(/sort=fecha%2Cdesc/)
    expect(ruta).toMatch(/page=0/)
  })

  it('el filtro de fechas queda en la dirección y vuelve a la primera página', async () => {
    const usuario = userEvent.setup()
    const llamadas = simularSesion(CIUDADANA, LISTA)
    renderizarApp('/ingresos?page=2')
    await screen.findByRole('table', { name: 'Mis ingresos' })

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-01' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-30' } })
    await usuario.click(screen.getByRole('button', { name: 'Filtrar' }))

    await vi.waitFor(() => {
      const ultima = llamadasA(llamadas, 'GET', '/api/ingresos').at(-1)!
      expect(ultima.ruta).toMatch(/desde=2026-09-01/)
      expect(ultima.ruta).toMatch(/hasta=2026-09-30/)
      expect(ultima.ruta).toMatch(/page=0/)
    })
  })

  it('entrar con ?desde, ?hasta y ?page pide justo eso; una fecha mal escrita se ignora', async () => {
    const llamadas = simularSesion(CIUDADANA, LISTA)

    renderizarApp('/ingresos?desde=2026-01-01&hasta=ayer&page=1')

    await screen.findByRole('table', { name: 'Mis ingresos' })
    const ruta = llamadasA(llamadas, 'GET', '/api/ingresos')[0].ruta
    expect(ruta).toMatch(/desde=2026-01-01/)
    expect(ruta).not.toMatch(/hasta=/)
    expect(ruta).toMatch(/page=1/)
  })

  it('con las fechas al revés avisa y no deja filtrar', async () => {
    const llamadas = simularSesion(CIUDADANA, LISTA)
    renderizarApp('/ingresos')
    await screen.findByRole('table', { name: 'Mis ingresos' })
    const antes = llamadas.length

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-10' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-01' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Filtros' }))

    expect(screen.getByText(/no puede ser posterior a la final/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filtrar' })).toBeDisabled()
    expect(llamadas.length).toBe(antes)
  })

  it('si la dirección trae las fechas al revés no pide nada y explica qué corregir', async () => {
    const llamadas = simularSesion(CIUDADANA, LISTA)

    renderizarApp('/ingresos?desde=2026-10-10&hasta=2026-10-01')

    expect(await screen.findByText('Revisa las fechas')).toBeInTheDocument()
    expect(llamadasA(llamadas, 'GET', '/api/ingresos')).toHaveLength(0)
  })

  it('sin ingresos explica cómo registrar el primero', async () => {
    simularSesion(CIUDADANA, { 'GET /api/ingresos': () => json(pagina([])) })

    renderizarApp('/ingresos')

    expect(await screen.findByText(/Todavía no registraste ingresos/)).toBeInTheDocument()
  })

  it('si la lista falla muestra un mensaje general, nunca el del servidor, y deja reintentar', async () => {
    const usuario = userEvent.setup()
    let intentos = 0
    simularSesion(CIUDADANA, {
      'GET /api/ingresos': () =>
        ++intentos === 1 ? problema(500, 'detalle interno') : json(pagina(INGRESOS)),
    })

    renderizarApp('/ingresos')

    expect(await screen.findByRole('alert')).toHaveTextContent(/error inesperado/)
    expect(screen.queryByText('detalle interno')).not.toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Salario de septiembre')).toBeInTheDocument()
  })
})

describe('permisos', () => {
  it('quien no tiene ingreso:leer no ve el menú ni entra a la pantalla', async () => {
    const llamadas = simularSesion(AUDITOR, LISTA)

    renderizarApp('/ingresos')

    expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Mis ingresos' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Tipo de cambio' })).not.toBeInTheDocument()
    expect(llamadasA(llamadas, 'GET', '/api/ingresos')).toHaveLength(0)
  })

  it('quien solo puede leer no ve registrar, editar ni eliminar', async () => {
    simularSesion(SOLO_LEER, LISTA)

    renderizarApp('/ingresos')

    await screen.findByRole('table', { name: 'Mis ingresos' })
    expect(screen.queryByRole('link', { name: 'Nuevo ingreso' })).not.toBeInTheDocument()
    expect(screen.queryByText('Editar')).not.toBeInTheDocument()
    expect(screen.queryByText('Eliminar')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Proyectar a otra moneda' })).toBeInTheDocument()
  })

  it('quien solo puede leer no entra a registrar un ingreso', async () => {
    simularSesion(SOLO_LEER, LISTA)

    renderizarApp('/ingresos/nuevo')

    expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument()
  })

  it('si la API niega la acción, se muestra el 403', async () => {
    const usuario = userEvent.setup()
    simularSesion(CIUDADANA, {
      ...LISTA,
      'DELETE /api/ingresos/5': () => problema(403, 'No tienes permiso para hacer esto.'),
    })
    renderizarApp('/ingresos')
    await screen.findByRole('table', { name: 'Mis ingresos' })

    await usuario.click(screen.getAllByRole('button', { name: /Eliminar el ingreso/ })[0])
    await usuario.click(screen.getByRole('button', { name: 'Sí, eliminar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/No tienes permiso/)
  })
})

describe('registrar y editar', () => {
  it('registra un ingreso y vuelve a la lista con un aviso', async () => {
    const usuario = userEvent.setup()
    const llamadas = simularSesion(CIUDADANA, {
      ...LISTA,
      'POST /api/ingresos': () =>
        json(ingreso({ id: 9, fecha: '2026-10-05', montoGtq: 1500.5 }), 201),
    })
    renderizarApp('/ingresos/nuevo')

    fireEvent.change(await screen.findByLabelText('Fecha'), { target: { value: '2026-10-05' } })
    await usuario.type(screen.getByLabelText('Monto (Q)'), '1500.50')
    await usuario.type(screen.getByLabelText('Descripción (opcional)'), 'Bono')
    await usuario.click(screen.getByRole('button', { name: 'Registrar ingreso' }))

    expect(await screen.findByText(/Registramos el ingreso de Q\s?1,500\.50/)).toBeInTheDocument()
    expect(llamadasA(llamadas, 'POST', '/api/ingresos')[0].cuerpo).toEqual({
      fecha: '2026-10-05',
      montoGtq: 1500.5,
      descripcion: 'Bono',
    })
  })

  it('no envía nada si el monto o la fecha no son válidos', async () => {
    const usuario = userEvent.setup()
    const llamadas = simularSesion(CIUDADANA, LISTA)
    renderizarApp('/ingresos/nuevo')

    fireEvent.change(await screen.findByLabelText('Fecha'), { target: { value: '2099-01-01' } })
    await usuario.type(screen.getByLabelText('Monto (Q)'), '0')
    await usuario.click(screen.getByRole('button', { name: 'Registrar ingreso' }))

    expect(screen.getByText('La fecha no puede ser futura.')).toBeInTheDocument()
    expect(screen.getByText('El monto debe ser mayor que cero.')).toBeInTheDocument()
    expect(screen.getByLabelText('Monto (Q)')).toHaveAttribute('aria-invalid', 'true')
    expect(llamadasA(llamadas, 'POST', '/api/ingresos')).toHaveLength(0)
  })

  it('el error de la API sobre montoGtq aparece junto al monto', async () => {
    const usuario = userEvent.setup()
    simularSesion(CIUDADANA, {
      'POST /api/ingresos': () =>
        problema(400, 'La solicitud tiene campos invalidos', [
          { campo: 'montoGtq', motivo: 'numeric value out of bounds' },
        ]),
    })
    renderizarApp('/ingresos/nuevo')

    await usuario.type(await screen.findByLabelText('Monto (Q)'), '25')
    await usuario.click(screen.getByRole('button', { name: 'Registrar ingreso' }))

    expect(await screen.findByText('numeric value out of bounds')).toBeInTheDocument()
    expect(screen.getByLabelText('Monto (Q)')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('edita un ingreso con sus datos cargados', async () => {
    const usuario = userEvent.setup()
    const llamadas = simularSesion(CIUDADANA, {
      ...LISTA,
      'GET /api/ingresos/5': () => json(ingreso()),
      'PUT /api/ingresos/5': () => json(ingreso({ montoGtq: 5000 })),
    })
    renderizarApp('/ingresos/5/editar')

    const monto = await screen.findByLabelText('Monto (Q)')
    expect(monto).toHaveValue('4500.50')
    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-10-01')
    await usuario.clear(monto)
    await usuario.type(monto, '5000')
    await usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Guardamos los cambios del ingreso.')).toBeInTheDocument()
    expect(llamadasA(llamadas, 'PUT', '/api/ingresos/5')[0].cuerpo).toEqual({
      fecha: '2026-10-01',
      montoGtq: 5000,
      descripcion: 'Salario de septiembre',
    })
  })

  it('un ingreso ajeno o inexistente muestra el 404 de la API', async () => {
    simularSesion(CIUDADANA, {
      'GET /api/ingresos/77': () => problema(404, 'El ingreso no existe'),
    })

    renderizarApp('/ingresos/77/editar')

    expect(await screen.findByRole('alert')).toHaveTextContent('No encontrado')
    expect(screen.getByRole('link', { name: 'Volver a mis ingresos' })).toBeInTheDocument()
  })
})

describe('eliminar', () => {
  it('pide confirmación; cancelar no borra nada', async () => {
    const usuario = userEvent.setup()
    const llamadas = simularSesion(CIUDADANA, LISTA)
    renderizarApp('/ingresos')
    await screen.findByRole('table', { name: 'Mis ingresos' })

    await usuario.click(screen.getAllByRole('button', { name: /Eliminar el ingreso/ })[0])
    expect(screen.getByText(/¿Eliminar el ingreso de Q\s?4,500\.50/)).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(llamadasA(llamadas, 'DELETE', '/api/ingresos/5')).toHaveLength(0)
  })

  it('al confirmar elimina, avisa y recarga la lista', async () => {
    const usuario = userEvent.setup()
    const llamadas = simularSesion(CIUDADANA, {
      ...LISTA,
      'DELETE /api/ingresos/5': () => new Response(null, { status: 204 }),
    })
    renderizarApp('/ingresos')
    await screen.findByRole('table', { name: 'Mis ingresos' })
    const cargasAntes = llamadasA(llamadas, 'GET', '/api/ingresos').length

    await usuario.click(screen.getAllByRole('button', { name: /Eliminar el ingreso/ })[0])
    await usuario.click(screen.getByRole('button', { name: 'Sí, eliminar' }))

    expect(await screen.findByText(/Eliminamos el ingreso de Q\s?4,500\.50/)).toBeInTheDocument()
    expect(llamadasA(llamadas, 'DELETE', '/api/ingresos/5')).toHaveLength(1)
    await vi.waitFor(() =>
      expect(llamadasA(llamadas, 'GET', '/api/ingresos').length).toBeGreaterThan(cargasAntes),
    )
  })
})

describe('proyección a otra moneda', () => {
  const RUTAS = {
    'GET /api/divisas/monedas': () => json(MONEDAS),
    'GET /api/ingresos/proyeccion': () => json(proyeccion()),
  }

  it('el enlace desde la lista conserva el período filtrado', async () => {
    simularSesion(CIUDADANA, LISTA)

    renderizarApp('/ingresos?desde=2026-01-01&hasta=2026-06-30')

    expect(await screen.findByRole('link', { name: 'Proyectar a otra moneda' })).toHaveAttribute(
      'href',
      '/ingresos/proyeccion?desde=2026-01-01&hasta=2026-06-30',
    )
  })

  it('pide la proyección a la API y muestra el resultado con el tipo de cambio usado', async () => {
    const llamadas = simularSesion(CIUDADANA, RUTAS)

    renderizarApp('/ingresos/proyeccion?moneda=EUR')

    expect(
      await screen.findByRole('heading', { name: /Q\s?4,800\.50 equivalen a EUR\s?532\.17/ }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Suma de 2 ingresos de todas las fechas/)).toBeInTheDocument()
    expect(screen.getByText(/Dólares estadounidenses por 1 EUR/)).toBeInTheDocument()
    expect(screen.getByText(/1\.169876/)).toBeInTheDocument()
    expect(screen.getByText(/7\.71234/)).toBeInTheDocument()
    expect(screen.getByText('BANGUAT')).toBeInTheDocument()
    expect(screen.queryByText('Tipo de cambio estimado')).not.toBeInTheDocument()
    expect(llamadasA(llamadas, 'GET', '/api/ingresos/proyeccion')[0].ruta).toMatch(/moneda=EUR/)
  })

  it('sin moneda en la dirección proyecta al dólar', async () => {
    const llamadas = simularSesion(CIUDADANA, RUTAS)

    renderizarApp('/ingresos/proyeccion')

    await screen.findByRole('heading', { name: /equivalen a/ })
    expect(llamadasA(llamadas, 'GET', '/api/ingresos/proyeccion')[0].ruta).toMatch(/moneda=USD/)
  })

  it('cambiar la moneda y el período vuelve a pedir la proyección con esos datos', async () => {
    const usuario = userEvent.setup()
    const llamadas = simularSesion(CIUDADANA, RUTAS)
    renderizarApp('/ingresos/proyeccion')
    await screen.findByRole('option', { name: 'Peso mexicano (MXN)' })

    await usuario.selectOptions(screen.getByLabelText('Moneda'), 'MXN')
    fireEvent.change(screen.getByLabelText('Ingresos desde'), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByLabelText('Tipo de cambio del día'), {
      target: { value: '2026-10-20' },
    })
    await usuario.click(screen.getByRole('button', { name: 'Calcular' }))

    await vi.waitFor(() => {
      const ultima = llamadasA(llamadas, 'GET', '/api/ingresos/proyeccion').at(-1)!
      expect(ultima.ruta).toMatch(/moneda=MXN/)
      expect(ultima.ruta).toMatch(/desde=2026-01-01/)
      expect(ultima.ruta).toMatch(/fecha=2026-10-20/)
    })
  })

  it('no calcula con el período al revés ni con un tipo de cambio futuro', async () => {
    const usuario = userEvent.setup()
    const llamadas = simularSesion(CIUDADANA, RUTAS)
    renderizarApp('/ingresos/proyeccion')
    await screen.findByRole('heading', { name: /equivalen a/ })
    const antes = llamadasA(llamadas, 'GET', '/api/ingresos/proyeccion').length

    fireEvent.change(screen.getByLabelText('Ingresos desde'), { target: { value: '2026-10-10' } })
    fireEvent.change(screen.getByLabelText('Ingresos hasta'), { target: { value: '2026-10-01' } })
    fireEvent.change(screen.getByLabelText('Tipo de cambio del día'), {
      target: { value: '2099-01-01' },
    })
    await usuario.click(screen.getByRole('button', { name: 'Calcular' }))

    expect(screen.getByText('No puede ser posterior a «Hasta».')).toBeInTheDocument()
    expect(screen.getByText(/no puede ser de una fecha futura/)).toBeInTheDocument()
    expect(llamadasA(llamadas, 'GET', '/api/ingresos/proyeccion')).toHaveLength(antes)
  })

  it('avisa cuando el tipo de cambio es estimado', async () => {
    simularSesion(CIUDADANA, {
      ...RUTAS,
      'GET /api/ingresos/proyeccion': () => json(proyeccion({ estimado: true })),
    })

    renderizarApp('/ingresos/proyeccion?moneda=EUR')

    expect(await screen.findByText('Tipo de cambio estimado')).toBeInTheDocument()
  })

  it('para el dólar no muestra un segundo tipo de cambio', async () => {
    simularSesion(CIUDADANA, {
      ...RUTAS,
      'GET /api/ingresos/proyeccion': () =>
        json(
          proyeccion({
            moneda: 'USD',
            nombreMoneda: 'Dolar estadounidense',
            totalEnMoneda: 622.43,
            valorMoneda: null,
            fechaMoneda: null,
            convencion: 'QUETZALES_POR_DOLAR',
          }),
        ),
    })

    renderizarApp('/ingresos/proyeccion?moneda=USD')

    await screen.findByRole('heading', { name: /USD\s?622\.43/ })
    expect(screen.getAllByText(/Quetzales por 1 dólar estadounidense/)).toHaveLength(1)
  })

  it('si no hay tipo de cambio (503) lo explica sin inventar un número', async () => {
    simularSesion(CIUDADANA, {
      ...RUTAS,
      'GET /api/ingresos/proyeccion': () => problema(503, 'detalle interno del Banguat'),
    })

    renderizarApp('/ingresos/proyeccion?moneda=EUR')

    expect(await screen.findByText('No hay tipo de cambio disponible')).toBeInTheDocument()
    expect(screen.queryByText(/detalle interno/)).not.toBeInTheDocument()
    expect(screen.queryByText(/equivalen a/)).not.toBeInTheDocument()
  })
})

describe('tipo de cambio por moneda', () => {
  const RUTAS = {
    'GET /api/divisas/monedas': () => json(MONEDAS),
    'GET /api/divisas/tipo-cambio': () => json(tipoCambio()),
  }

  it('muestra el valor del dólar de hoy con su fecha, su fuente y cómo se cotiza', async () => {
    const llamadas = simularSesion(CIUDADANA, RUTAS)

    renderizarApp('/divisas')

    expect(await screen.findByRole('heading', { name: /7\.71234/ })).toBeInTheDocument()
    expect(screen.getByText('Quetzales por 1 dólar estadounidense.')).toBeInTheDocument()
    expect(screen.getByText('BANGUAT')).toBeInTheDocument()
    const ruta = llamadasA(llamadas, 'GET', '/api/divisas/tipo-cambio')[0].ruta
    expect(ruta).toMatch(/moneda=USD/)
    expect(ruta).not.toMatch(/fecha=/)
  })

  it('consulta otra moneda y fecha, y la deja en la dirección', async () => {
    const usuario = userEvent.setup()
    const llamadas = simularSesion(CIUDADANA, RUTAS)
    renderizarApp('/divisas')
    await screen.findByRole('option', { name: 'Euro (EUR)' })

    await usuario.selectOptions(screen.getByLabelText('Moneda'), 'EUR')
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-10-19' } })
    await usuario.click(screen.getByRole('button', { name: 'Consultar' }))

    await vi.waitFor(() => {
      const ultima = llamadasA(llamadas, 'GET', '/api/divisas/tipo-cambio').at(-1)!
      expect(ultima.ruta).toMatch(/moneda=EUR/)
      expect(ultima.ruta).toMatch(/fecha=2026-10-19/)
    })
  })

  it('no consulta una fecha futura', async () => {
    const usuario = userEvent.setup()
    const llamadas = simularSesion(CIUDADANA, RUTAS)
    renderizarApp('/divisas')
    await screen.findByRole('heading', { name: /7\.71234/ })
    const antes = llamadasA(llamadas, 'GET', '/api/divisas/tipo-cambio').length

    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2099-01-01' } })
    await usuario.click(screen.getByRole('button', { name: 'Consultar' }))

    expect(screen.getByText('No puede ser una fecha futura.')).toBeInTheDocument()
    expect(llamadasA(llamadas, 'GET', '/api/divisas/tipo-cambio')).toHaveLength(antes)
  })

  it('avisa si el valor es estimado y explica cuando no hay ninguno (503)', async () => {
    simularSesion(CIUDADANA, {
      ...RUTAS,
      'GET /api/divisas/tipo-cambio': () => json(tipoCambio({ estimado: true })),
    })
    const vista = renderizarApp('/divisas')
    expect(await screen.findByText('Valor estimado')).toBeInTheDocument()
    vista.unmount()
    vi.unstubAllGlobals()
    limpiarSesion()

    simularSesion(CIUDADANA, {
      ...RUTAS,
      'GET /api/divisas/tipo-cambio': () => problema(503, 'detalle interno'),
    })
    renderizarApp('/divisas')
    expect(await screen.findByText('No hay tipo de cambio disponible')).toBeInTheDocument()
    expect(screen.queryByText('detalle interno')).not.toBeInTheDocument()
  })

  it('el menú de la ciudadana lleva a sus ingresos y al tipo de cambio', async () => {
    simularSesion(CIUDADANA, RUTAS)

    renderizarApp('/divisas')

    expect(await screen.findByRole('link', { name: 'Mis ingresos' })).toHaveAttribute(
      'href',
      '/ingresos',
    )
    expect(screen.getByRole('link', { name: 'Tipo de cambio' })).toHaveAttribute('href', '/divisas')
  })
})
