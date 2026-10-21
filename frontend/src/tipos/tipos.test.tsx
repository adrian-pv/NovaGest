import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { json, problema, type Llamada } from '../test/api-simulada'
import { GESTOR, pagina, TIPO_IGSS, TIPO_INACTIVO, TIPO_ORNATO } from '../test/datos'
import { limpiarSesion, renderizarApp, simularSesion } from '../test/utilidades'

const ADMIN = {
  id: 1,
  correo: 'admin@demo.com',
  nombre: 'Ada Admin',
  roles: ['ADMINISTRADOR'],
  permisos: [
    'tipo_tramite:leer',
    'tipo_tramite:crear',
    'tipo_tramite:editar',
    'tipo_tramite:eliminar',
  ],
  alcanceTotal: true,
}

const SOLO_EDITAR = { ...ADMIN, permisos: ['tipo_tramite:leer', 'tipo_tramite:editar'] }

const TIPOS = [TIPO_ORNATO, TIPO_IGSS, TIPO_INACTIVO]

const LISTA = { 'GET /api/tipos-tramite': () => json(pagina(TIPOS)) }

function llamadasA(llamadas: Llamada[], metodo: string, ruta: string): Llamada[] {
  return llamadas.filter((l) => l.metodo === metodo && l.ruta.split('?')[0] === ruta)
}

beforeEach(() => limpiarSesion())
afterEach(() => vi.unstubAllGlobals())

describe('lista de tipos de trámite', () => {
  it('muestra nombre, monto, cantidad de campos y estado de cada tipo', async () => {
    simularSesion(ADMIN, LISTA)

    renderizarApp('/tipos')

    const tabla = await screen.findByRole('table', { name: 'Tipos de trámite' })
    const filas = within(tabla).getAllByRole('row')
    expect(filas).toHaveLength(4)
    expect(within(filas[1]).getByText('Boleto de ornato')).toBeInTheDocument()
    expect(within(filas[1]).getByText(/Q\s?25\.00/)).toBeInTheDocument()
    expect(within(filas[1]).getByText('4')).toBeInTheDocument()
    expect(within(filas[1]).getByText('Activo')).toBeInTheDocument()
    expect(within(filas[3]).getByText('Tipo retirado')).toBeInTheDocument()
    expect(within(filas[3]).getByText('Inactivo')).toBeInTheDocument()
  })

  it('pide la lista ordenada y paginada, y el filtro por estado queda en la dirección', async () => {
    const usuario = userEvent.setup()
    const llamadas = simularSesion(ADMIN, LISTA)

    renderizarApp('/tipos')
    await screen.findByRole('table', { name: 'Tipos de trámite' })
    expect(llamadasA(llamadas, 'GET', '/api/tipos-tramite')[0].ruta).toMatch(/page=0/)

    await usuario.selectOptions(screen.getByLabelText('Estado'), 'Inactivos')

    await vi.waitFor(() => {
      const ultima = llamadasA(llamadas, 'GET', '/api/tipos-tramite').at(-1)!
      expect(ultima.ruta).toMatch(/activo=false/)
    })
    expect(screen.getByLabelText('Estado')).toHaveValue('false')
  })

  it('entrar con ?activo=true y ?page=1 pide justo eso', async () => {
    const llamadas = simularSesion(ADMIN, LISTA)

    renderizarApp('/tipos?activo=true&page=1')

    await screen.findByRole('table', { name: 'Tipos de trámite' })
    const ruta = llamadasA(llamadas, 'GET', '/api/tipos-tramite')[0].ruta
    expect(ruta).toMatch(/activo=true/)
    expect(ruta).toMatch(/page=1/)
  })

  it('ignora un valor de filtro que no es true ni false', async () => {
    const llamadas = simularSesion(ADMIN, LISTA)

    renderizarApp('/tipos?activo=quizas')

    await screen.findByRole('table', { name: 'Tipos de trámite' })
    expect(llamadasA(llamadas, 'GET', '/api/tipos-tramite')[0].ruta).not.toMatch(/activo=/)
  })

  it('sin tipos explica cómo crear el primero', async () => {
    simularSesion(ADMIN, { 'GET /api/tipos-tramite': () => json(pagina([])) })

    renderizarApp('/tipos')

    expect(await screen.findByText(/Todavía no hay tipos de trámite/)).toBeInTheDocument()
  })

  it('si la lista falla muestra el error y deja reintentar', async () => {
    const usuario = userEvent.setup()
    let intentos = 0
    simularSesion(ADMIN, {
      'GET /api/tipos-tramite': () =>
        ++intentos === 1 ? problema(500, 'detalle interno') : json(pagina(TIPOS)),
    })

    renderizarApp('/tipos')

    expect(await screen.findByRole('alert')).toHaveTextContent(/error inesperado/)
    expect(screen.queryByText('detalle interno')).not.toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Pago de IGSS')).toBeInTheDocument()
  })
})

describe('permisos', () => {
  it('quien solo puede editar no ve crear ni eliminar', async () => {
    simularSesion(SOLO_EDITAR, LISTA)

    renderizarApp('/tipos')

    await screen.findByRole('table', { name: 'Tipos de trámite' })
    expect(screen.queryByRole('link', { name: 'Nuevo tipo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Eliminar/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Editar Pago de IGSS' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Desactivar Pago de IGSS' })).toBeInTheDocument()
  })

  it('el administrador ve todas las acciones', async () => {
    simularSesion(ADMIN, LISTA)

    renderizarApp('/tipos')

    await screen.findByRole('table', { name: 'Tipos de trámite' })
    expect(screen.getByRole('link', { name: 'Nuevo tipo' })).toHaveAttribute('href', '/tipos/nuevo')
    expect(screen.getByRole('button', { name: 'Eliminar Pago de IGSS' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Activar Tipo retirado' })).toBeInTheDocument()
  })

  it.each(['/tipos', '/tipos/nuevo', '/tipos/1/editar'])(
    'quien no administra tipos (el gestor) ve "Sin permiso" en %s y no se llama a la API',
    async (ruta) => {
      const llamadas = simularSesion(GESTOR, LISTA)

      renderizarApp(ruta)

      expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument()
      expect(llamadasA(llamadas, 'GET', '/api/tipos-tramite')).toHaveLength(0)
    },
  )

  it('crear exige tipo_tramite:crear aunque pueda editar', async () => {
    simularSesion(SOLO_EDITAR, LISTA)

    renderizarApp('/tipos/nuevo')

    expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument()
  })

  it('el menú muestra "Tipos de trámite" solo a quien puede editarlos', async () => {
    simularSesion(ADMIN, LISTA)
    const { unmount } = renderizarApp('/panel')
    const menu = await screen.findByRole('navigation', { name: /principal/i })
    expect(within(menu).getByRole('link', { name: 'Tipos de trámite' })).toHaveAttribute(
      'href',
      '/tipos',
    )
    unmount()

    limpiarSesion()
    vi.unstubAllGlobals()
    simularSesion(GESTOR, LISTA)
    renderizarApp('/panel')
    const menuGestor = await screen.findByRole('navigation', { name: /principal/i })
    expect(
      within(menuGestor).queryByRole('link', { name: 'Tipos de trámite' }),
    ).not.toBeInTheDocument()
  })
})

describe('activar, desactivar y eliminar', () => {
  it('desactivar manda el tipo con activo en falso y SIN la lista de campos (la API los deja como están)', async () => {
    const usuario = userEvent.setup()
    const llamadas = simularSesion(ADMIN, {
      ...LISTA,
      'PUT /api/tipos-tramite/1': () => json({ ...TIPO_ORNATO, activo: false }),
    })

    renderizarApp('/tipos')
    await usuario.click(await screen.findByRole('button', { name: 'Desactivar Boleto de ornato' }))

    expect(await screen.findByText('Desactivamos «Boleto de ornato».')).toBeInTheDocument()
    const put = llamadasA(llamadas, 'PUT', '/api/tipos-tramite/1')
    expect(put).toHaveLength(1)
    expect(put[0].cuerpo).toEqual({
      nombre: 'Boleto de ornato',
      descripcion: 'Pago del boleto de ornato',
      monto: 25,
      activo: false,
    })
    expect(put[0].cuerpo).not.toHaveProperty('campos')
    // Recarga la lista para mostrar el cambio
    expect(llamadasA(llamadas, 'GET', '/api/tipos-tramite').length).toBeGreaterThanOrEqual(2)
  })

  it('activar un tipo inactivo manda activo en verdadero y conserva la descripción vacía como null', async () => {
    const usuario = userEvent.setup()
    const llamadas = simularSesion(ADMIN, {
      'GET /api/tipos-tramite': () => json(pagina([{ ...TIPO_IGSS, activo: false }])),
      'PUT /api/tipos-tramite/2': () => json({ ...TIPO_IGSS, activo: true }),
    })

    renderizarApp('/tipos')
    await usuario.click(await screen.findByRole('button', { name: 'Activar Pago de IGSS' }))

    expect(await screen.findByText('Activamos «Pago de IGSS».')).toBeInTheDocument()
    expect(llamadasA(llamadas, 'PUT', '/api/tipos-tramite/2')[0].cuerpo).toEqual({
      nombre: 'Pago de IGSS',
      descripcion: null,
      monto: 0,
      activo: true,
    })
  })

  it('si la API rechaza el cambio muestra el motivo y no dice que funcionó', async () => {
    const usuario = userEvent.setup()
    simularSesion(ADMIN, {
      ...LISTA,
      'PUT /api/tipos-tramite/1': () => problema(403, 'No tienes permiso para hacer esto.'),
    })

    renderizarApp('/tipos')
    await usuario.click(await screen.findByRole('button', { name: 'Desactivar Boleto de ornato' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/No tienes permiso/)
    expect(screen.queryByText(/Desactivamos/)).not.toBeInTheDocument()
  })

  it('eliminar pide confirmación y no llama a la API hasta confirmar', async () => {
    const usuario = userEvent.setup()
    const llamadas = simularSesion(ADMIN, {
      ...LISTA,
      'DELETE /api/tipos-tramite/2': () => new Response(null, { status: 204 }),
    })

    renderizarApp('/tipos')
    await usuario.click(await screen.findByRole('button', { name: 'Eliminar Pago de IGSS' }))

    expect(screen.getByText('¿Eliminar «Pago de IGSS»?')).toBeInTheDocument()
    expect(llamadasA(llamadas, 'DELETE', '/api/tipos-tramite/2')).toHaveLength(0)

    await usuario.click(screen.getByRole('button', { name: 'Sí, eliminar' }))

    expect(await screen.findByText('Eliminamos «Pago de IGSS».')).toBeInTheDocument()
    expect(llamadasA(llamadas, 'DELETE', '/api/tipos-tramite/2')).toHaveLength(1)
    expect(screen.queryByText('¿Eliminar «Pago de IGSS»?')).not.toBeInTheDocument()
  })

  it('cancelar la confirmación no elimina nada', async () => {
    const usuario = userEvent.setup()
    const llamadas = simularSesion(ADMIN, LISTA)

    renderizarApp('/tipos')
    await usuario.click(await screen.findByRole('button', { name: 'Eliminar Pago de IGSS' }))
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByText('¿Eliminar «Pago de IGSS»?')).not.toBeInTheDocument()
    expect(llamadasA(llamadas, 'DELETE', '/api/tipos-tramite/2')).toHaveLength(0)
  })

  it('la confirmación se refiere al último tipo elegido', async () => {
    const usuario = userEvent.setup()
    simularSesion(ADMIN, LISTA)

    renderizarApp('/tipos')
    await usuario.click(await screen.findByRole('button', { name: 'Eliminar Pago de IGSS' }))
    await usuario.click(screen.getByRole('button', { name: 'Eliminar Boleto de ornato' }))

    expect(screen.getByText('¿Eliminar «Boleto de ornato»?')).toBeInTheDocument()
    expect(screen.queryByText('¿Eliminar «Pago de IGSS»?')).not.toBeInTheDocument()
  })

  it('al pedir eliminar se limpia el aviso anterior', async () => {
    const usuario = userEvent.setup()
    simularSesion(ADMIN, {
      ...LISTA,
      'PUT /api/tipos-tramite/1': () => json({ ...TIPO_ORNATO, activo: false }),
    })

    renderizarApp('/tipos')
    await usuario.click(await screen.findByRole('button', { name: 'Desactivar Boleto de ornato' }))
    await screen.findByText('Desactivamos «Boleto de ornato».')
    await usuario.click(screen.getByRole('button', { name: 'Eliminar Pago de IGSS' }))

    expect(screen.queryByText('Desactivamos «Boleto de ornato».')).not.toBeInTheDocument()
  })

  it('si eliminar falla muestra el error y deja el tipo en la lista', async () => {
    const usuario = userEvent.setup()
    simularSesion(ADMIN, {
      ...LISTA,
      'DELETE /api/tipos-tramite/2': () => problema(404, 'El tipo de tramite no existe'),
    })

    renderizarApp('/tipos')
    await usuario.click(await screen.findByRole('button', { name: 'Eliminar Pago de IGSS' }))
    await usuario.click(screen.getByRole('button', { name: 'Sí, eliminar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('El tipo de tramite no existe')
    expect(screen.queryByText(/Eliminamos/)).not.toBeInTheDocument()
  })

  it('si se elimina el último de una página que no es la primera, vuelve a la anterior', async () => {
    const usuario = userEvent.setup()
    let eliminado = false
    const llamadas = simularSesion(ADMIN, {
      'GET /api/tipos-tramite': (llamada) =>
        json(
          llamada.ruta.includes('page=1') && !eliminado
            ? pagina([TIPO_IGSS], { number: 1, totalElements: 21, totalPages: 2 })
            : pagina(TIPOS, { number: 0, totalElements: 20, totalPages: 1 }),
        ),
      'DELETE /api/tipos-tramite/2': () => {
        eliminado = true
        return new Response(null, { status: 204 })
      },
    })

    renderizarApp('/tipos?page=1')
    await usuario.click(await screen.findByRole('button', { name: 'Eliminar Pago de IGSS' }))
    await usuario.click(screen.getByRole('button', { name: 'Sí, eliminar' }))

    expect(await screen.findByText('Boleto de ornato')).toBeInTheDocument()
    expect(llamadasA(llamadas, 'GET', '/api/tipos-tramite').at(-1)!.ruta).toMatch(/page=0/)
  })
})

describe('crear un tipo', () => {
  async function escribir(etiqueta: string | RegExp, texto: string, indice = 0) {
    const usuario = userEvent.setup()
    const campos = screen.getAllByLabelText(etiqueta)
    await usuario.clear(campos[indice])
    // paste y no type: type interpreta [ y { como teclas especiales, y los patrones los llevan
    await usuario.click(campos[indice])
    await usuario.paste(texto)
  }

  it('manda lo escrito (monto como número, campos en orden) y vuelve a la lista con aviso', async () => {
    const usuario = userEvent.setup()
    const llamadas = simularSesion(ADMIN, {
      ...LISTA,
      'POST /api/tipos-tramite': () =>
        json({ ...TIPO_IGSS, id: 9, nombre: 'Licencia de venta' }, 201),
    })

    renderizarApp('/tipos/nuevo')
    await screen.findByRole('heading', { name: 'Nuevo tipo de trámite' })
    await escribir('Nombre', 'Licencia de venta')
    await escribir('Descripción (opcional)', 'Para comercios')
    await escribir('Monto a pagar (Q)', '12,5')
    await usuario.click(screen.getByRole('button', { name: 'Agregar campo' }))
    await usuario.click(screen.getByRole('button', { name: 'Agregar campo' }))
    await escribir('Clave', 'nit', 0)
    await escribir('Etiqueta', 'NIT', 0)
    await escribir('Patrón (opcional)', '^[0-9]{9}$')
    await usuario.click(screen.getAllByLabelText('Obligatorio para enviar el trámite')[0])
    await escribir('Clave', 'locales', 1)
    await escribir('Etiqueta', 'Cantidad de locales', 1)
    await usuario.selectOptions(screen.getAllByLabelText('Tipo de dato')[1], 'Número')
    await escribir('Mínimo (opcional)', '1')
    await usuario.click(screen.getByRole('button', { name: 'Crear tipo' }))

    expect(await screen.findByText('Creamos el tipo «Licencia de venta».')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tipos de trámite' })).toBeInTheDocument()
    expect(llamadasA(llamadas, 'POST', '/api/tipos-tramite')[0].cuerpo).toEqual({
      nombre: 'Licencia de venta',
      descripcion: 'Para comercios',
      monto: 12.5,
      activo: true,
      campos: [
        {
          clave: 'nit',
          etiqueta: 'NIT',
          tipoDato: 'TEXTO',
          obligatorio: true,
          patron: '^[0-9]{9}$',
          minimo: null,
        },
        {
          clave: 'locales',
          etiqueta: 'Cantidad de locales',
          tipoDato: 'NUMERO',
          obligatorio: false,
          patron: null,
          minimo: 1,
        },
      ],
    })
  })

  it('un formulario vacío muestra los errores junto a cada campo y no llama a la API', async () => {
    const usuario = userEvent.setup()
    const llamadas = simularSesion(ADMIN, LISTA)

    renderizarApp('/tipos/nuevo')
    await screen.findByRole('heading', { name: 'Nuevo tipo de trámite' })
    await usuario.clear(screen.getByLabelText('Monto a pagar (Q)'))
    await usuario.click(screen.getByRole('button', { name: 'Agregar campo' }))
    await usuario.click(screen.getByRole('button', { name: 'Crear tipo' }))

    expect(screen.getByText('Escribe el nombre del tipo.')).toBeInTheDocument()
    expect(screen.getByText('Escribe el monto (puede ser 0).')).toBeInTheDocument()
    const campo = screen.getByRole('group', { name: 'Campo 1' })
    expect(within(campo).getByText('Escribe la clave del campo.')).toBeInTheDocument()
    expect(within(campo).getByLabelText('Clave')).toHaveAttribute('aria-invalid', 'true')
    expect(llamadasA(llamadas, 'POST', '/api/tipos-tramite')).toHaveLength(0)
  })

  it('el error de la API sobre un campo concreto aparece junto a ese campo, sin aviso duplicado', async () => {
    const usuario = userEvent.setup()
    simularSesion(ADMIN, {
      ...LISTA,
      'POST /api/tipos-tramite': () =>
        problema(400, 'La solicitud tiene campos invalidos', [
          { campo: 'campos[1].patron', motivo: 'No es una expresion regular valida' },
        ]),
    })

    renderizarApp('/tipos/nuevo')
    await screen.findByRole('heading', { name: 'Nuevo tipo de trámite' })
    await escribir('Nombre', 'Licencia')
    await usuario.click(screen.getByRole('button', { name: 'Agregar campo' }))
    await usuario.click(screen.getByRole('button', { name: 'Agregar campo' }))
    await escribir('Clave', 'uno', 0)
    await escribir('Etiqueta', 'Uno', 0)
    await escribir('Clave', 'dos', 1)
    await escribir('Etiqueta', 'Dos', 1)
    await usuario.click(screen.getByRole('button', { name: 'Crear tipo' }))

    const segundo = screen.getByRole('group', { name: 'Campo 2' })
    expect(
      await within(segundo).findByText('No es una expresion regular valida'),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('group', { name: 'Campo 1' })).queryByText(/expresion regular/),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    // El formulario sigue ahí, con lo escrito, para corregir
    expect(screen.getByLabelText('Nombre')).toHaveValue('Licencia')
  })

  it('un nombre repetido (409, sin detalle por campo) se muestra en un aviso', async () => {
    const usuario = userEvent.setup()
    simularSesion(ADMIN, {
      ...LISTA,
      'POST /api/tipos-tramite': () => problema(409, 'Ya existe un tipo de tramite con ese nombre'),
    })

    renderizarApp('/tipos/nuevo')
    await screen.findByRole('heading', { name: 'Nuevo tipo de trámite' })
    await escribir('Nombre', 'Boleto de ornato')
    await usuario.click(screen.getByRole('button', { name: 'Crear tipo' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya existe un tipo de tramite con ese nombre',
    )
  })

  it('un error de la API sin campo conocido no se pierde y el de otros campos sí queda junto a su entrada', async () => {
    const usuario = userEvent.setup()
    simularSesion(ADMIN, {
      ...LISTA,
      'POST /api/tipos-tramite': () =>
        problema(400, 'La solicitud tiene campos invalidos', [
          { campo: 'nombre', motivo: 'no debe estar vacío' },
          { campo: 'campos[0].orden', motivo: 'valor raro' },
        ]),
    })

    renderizarApp('/tipos/nuevo')
    await screen.findByRole('heading', { name: 'Nuevo tipo de trámite' })
    await escribir('Nombre', 'Algo')
    await usuario.click(screen.getByRole('button', { name: 'Crear tipo' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/valor raro/)
    expect(screen.getByText('no debe estar vacío')).toBeInTheDocument()
  })

  it('el botón se bloquea mientras se guarda para no crear el tipo dos veces', async () => {
    const usuario = userEvent.setup()
    let liberar: (r: Response) => void = () => {}
    const llamadas = simularSesion(ADMIN, {
      ...LISTA,
      'POST /api/tipos-tramite': () => new Promise<Response>((resolver) => (liberar = resolver)),
    })

    renderizarApp('/tipos/nuevo')
    await screen.findByRole('heading', { name: 'Nuevo tipo de trámite' })
    await escribir('Nombre', 'Licencia')
    await usuario.click(screen.getByRole('button', { name: 'Crear tipo' }))

    const guardando = await screen.findByRole('button', { name: 'Guardando...' })
    expect(guardando).toBeDisabled()
    await usuario.click(guardando)
    expect(llamadasA(llamadas, 'POST', '/api/tipos-tramite')).toHaveLength(1)
    liberar(json({ ...TIPO_IGSS, nombre: 'Licencia' }, 201))
    expect(await screen.findByText('Creamos el tipo «Licencia».')).toBeInTheDocument()
  })

  it('cancelar vuelve a la lista sin guardar', async () => {
    const usuario = userEvent.setup()
    const llamadas = simularSesion(ADMIN, LISTA)

    renderizarApp('/tipos/nuevo')
    await usuario.click(await screen.findByRole('link', { name: 'Cancelar' }))

    expect(await screen.findByRole('table', { name: 'Tipos de trámite' })).toBeInTheDocument()
    expect(llamadasA(llamadas, 'POST', '/api/tipos-tramite')).toHaveLength(0)
  })
})

describe('el editor de campos', () => {
  it('sin campos lo dice, y "Agregar campo" agrega una fila numerada', async () => {
    const usuario = userEvent.setup()
    simularSesion(ADMIN, LISTA)

    renderizarApp('/tipos/nuevo')

    expect(await screen.findByText(/no pide ningún dato/)).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Agregar campo' }))
    expect(screen.getByRole('group', { name: 'Campo 1' })).toBeInTheDocument()
    expect(screen.queryByText(/no pide ningún dato/)).not.toBeInTheDocument()
  })

  it('el patrón solo aparece en campos de texto y el mínimo solo en los numéricos', async () => {
    const usuario = userEvent.setup()
    simularSesion(ADMIN, LISTA)

    renderizarApp('/tipos/nuevo')
    await usuario.click(await screen.findByRole('button', { name: 'Agregar campo' }))
    const campo = screen.getByRole('group', { name: 'Campo 1' })
    expect(within(campo).getByLabelText('Patrón (opcional)')).toBeInTheDocument()
    expect(within(campo).queryByLabelText('Mínimo (opcional)')).not.toBeInTheDocument()

    await usuario.selectOptions(within(campo).getByLabelText('Tipo de dato'), 'Número')
    expect(within(campo).queryByLabelText('Patrón (opcional)')).not.toBeInTheDocument()
    expect(within(campo).getByLabelText('Mínimo (opcional)')).toBeInTheDocument()

    await usuario.selectOptions(within(campo).getByLabelText('Tipo de dato'), 'Fecha')
    expect(within(campo).queryByLabelText('Patrón (opcional)')).not.toBeInTheDocument()
    expect(within(campo).queryByLabelText('Mínimo (opcional)')).not.toBeInTheDocument()
  })

  it('Subir y Bajar cambian el orden, y están desactivados en los extremos', async () => {
    const usuario = userEvent.setup()
    simularSesion(ADMIN, { ...LISTA, 'GET /api/tipos-tramite/1': () => json(TIPO_ORNATO) })

    renderizarApp('/tipos/1/editar')
    await screen.findByRole('heading', { name: /Editar/ })
    const claves = () => screen.getAllByLabelText('Clave').map((c) => (c as HTMLInputElement).value)
    expect(claves()).toEqual(['dpi', 'ingreso', 'nacimiento', 'casado'])
    expect(screen.getByRole('button', { name: 'Subir el campo 1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Bajar el campo 4' })).toBeDisabled()

    await usuario.click(screen.getByRole('button', { name: 'Bajar el campo 1' }))
    expect(claves()).toEqual(['ingreso', 'dpi', 'nacimiento', 'casado'])
    await usuario.click(screen.getByRole('button', { name: 'Subir el campo 4' }))
    expect(claves()).toEqual(['ingreso', 'dpi', 'casado', 'nacimiento'])
  })

  it('al mover una fila conserva lo escrito en cada una y sus errores van con ella', async () => {
    const usuario = userEvent.setup()
    simularSesion(ADMIN, LISTA)

    renderizarApp('/tipos/nuevo')
    await usuario.click(await screen.findByRole('button', { name: 'Agregar campo' }))
    await usuario.click(screen.getByRole('button', { name: 'Agregar campo' }))
    await usuario.type(screen.getAllByLabelText('Clave')[0], 'Mala')
    await usuario.type(screen.getAllByLabelText('Clave')[1], 'buena')
    await usuario.click(screen.getByRole('button', { name: 'Crear tipo' }))
    expect(
      within(screen.getByRole('group', { name: 'Campo 1' })).getByText(/Usa minúsculas/),
    ).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Bajar el campo 1' }))

    const segundo = screen.getByRole('group', { name: 'Campo 2' })
    expect(within(segundo).getByLabelText('Clave')).toHaveValue('Mala')
    expect(within(segundo).getByText(/Usa minúsculas/)).toBeInTheDocument()
    expect(
      within(screen.getByRole('group', { name: 'Campo 1' })).getByLabelText('Clave'),
    ).toHaveValue('buena')
  })

  it('"Quitar" elimina esa fila y renumera las demás', async () => {
    const usuario = userEvent.setup()
    simularSesion(ADMIN, { ...LISTA, 'GET /api/tipos-tramite/1': () => json(TIPO_ORNATO) })

    renderizarApp('/tipos/1/editar')
    await screen.findByRole('heading', { name: /Editar/ })
    await usuario.click(screen.getByRole('button', { name: 'Quitar el campo 2' }))

    expect(screen.getAllByLabelText('Clave').map((c) => (c as HTMLInputElement).value)).toEqual([
      'dpi',
      'nacimiento',
      'casado',
    ])
    expect(screen.getByRole('group', { name: 'Campo 3' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Campo 4' })).not.toBeInTheDocument()
  })

  it('no deja pasar de 30 campos', async () => {
    const usuario = userEvent.setup()
    simularSesion(ADMIN, LISTA)

    renderizarApp('/tipos/nuevo')
    const agregar = await screen.findByRole('button', { name: 'Agregar campo' })
    for (let i = 0; i < 30; i++) await usuario.click(agregar)

    expect(screen.getAllByRole('group', { name: /^Campo \d+$/ })).toHaveLength(30)
    expect(agregar).toBeDisabled()
  })
})

describe('editar un tipo', () => {
  it('carga los datos del tipo, los campos en orden, y guarda lo cambiado', async () => {
    const usuario = userEvent.setup()
    const llamadas = simularSesion(ADMIN, {
      ...LISTA,
      'GET /api/tipos-tramite/1': () => json(TIPO_ORNATO),
      'PUT /api/tipos-tramite/1': () => json({ ...TIPO_ORNATO, nombre: 'Boleto 2027' }),
    })

    renderizarApp('/tipos/1/editar')

    expect(
      await screen.findByRole('heading', { name: 'Editar «Boleto de ornato»' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveValue('Boleto de ornato')
    expect(screen.getByLabelText('Monto a pagar (Q)')).toHaveValue('25')
    expect(screen.getByLabelText(/^Activo/)).toBeChecked()
    const primero = screen.getByRole('group', { name: 'Campo 1' })
    expect(within(primero).getByLabelText('Patrón (opcional)')).toHaveValue('^[0-9]{13}$')

    await usuario.clear(screen.getByLabelText('Nombre'))
    await usuario.type(screen.getByLabelText('Nombre'), 'Boleto 2027')
    await usuario.click(screen.getByLabelText(/^Activo/))
    await usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Guardamos «Boleto 2027».')).toBeInTheDocument()
    const cuerpo = llamadasA(llamadas, 'PUT', '/api/tipos-tramite/1')[0].cuerpo as {
      nombre: string
      activo: boolean
      monto: number
      campos: { clave: string; patron: string | null; minimo: number | null }[]
    }
    expect(cuerpo).toMatchObject({ nombre: 'Boleto 2027', activo: false, monto: 25 })
    expect(cuerpo.campos.map((c) => c.clave)).toEqual(['dpi', 'ingreso', 'nacimiento', 'casado'])
    expect(cuerpo.campos[0].patron).toBe('^[0-9]{13}$')
    expect(cuerpo.campos[1].minimo).toBe(0)
  })

  it('un tipo que no existe muestra el error de la API y un enlace para volver', async () => {
    simularSesion(ADMIN, {
      ...LISTA,
      'GET /api/tipos-tramite/77': () => problema(404, 'El tipo de tramite no existe'),
    })

    renderizarApp('/tipos/77/editar')

    expect(await screen.findByRole('alert')).toHaveTextContent('El tipo de tramite no existe')
    expect(screen.getByRole('link', { name: 'Volver a los tipos' })).toHaveAttribute(
      'href',
      '/tipos',
    )
  })

  it.each(['abc', '0', '-3', '1.5'])(
    'la dirección /tipos/%s/editar es "no encontrada" y no llama a la API',
    async (id) => {
      const llamadas = simularSesion(ADMIN, LISTA)

      renderizarApp(`/tipos/${id}/editar`)

      expect(
        await screen.findByRole('heading', { name: 'Página no encontrada' }),
      ).toBeInTheDocument()
      expect(llamadasA(llamadas, 'GET', `/api/tipos-tramite/${id}`)).toHaveLength(0)
    },
  )
})
