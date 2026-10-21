import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Rol, UsuarioAdmin } from '../api/usuarios'
import { json, problema, type Llamada } from '../test/api-simulada'
import { GESTOR, pagina } from '../test/datos'
import { limpiarSesion, renderizarApp, simularSesion } from '../test/utilidades'

const ADMIN = {
  id: 4,
  correo: 'admin@demo.com',
  nombre: 'Ada Admin',
  roles: ['ADMINISTRADOR'],
  permisos: ['usuario:leer', 'usuario:crear', 'usuario:editar', 'rol:leer'],
  alcanceTotal: true,
}

/** Puede consultar usuarios y roles, pero no cambiar nada (el auditor). */
const AUDITOR = { ...ADMIN, id: 3, nombre: 'Aldo Auditor', permisos: ['usuario:leer', 'rol:leer'] }

/** El gestor puede consultar usuarios, pero la API no le deja leer los roles. */
const GESTOR_CON_USUARIOS = { ...GESTOR, permisos: [...GESTOR.permisos, 'usuario:leer'] }

const ROLES: Rol[] = [
  {
    id: 4,
    nombre: 'ADMINISTRADOR',
    descripcion: 'Administra usuarios y roles',
    alcanceTotal: true,
    permisos: ['usuario:leer', 'usuario:crear', 'usuario:editar', 'tramite:leer', 'tramite:crear'],
  },
  {
    id: 2,
    nombre: 'GESTOR',
    descripcion: 'Revisa trámites',
    alcanceTotal: true,
    permisos: ['tramite:leer', 'tramite:editar', 'pago:editar', 'pago:leer'],
  },
  {
    id: 1,
    nombre: 'CIUDADANO',
    descripcion: 'Da seguimiento a sus trámites',
    alcanceTotal: false,
    permisos: ['tramite:crear', 'tramite:leer'],
  },
]

function usuario(extra: Partial<UsuarioAdmin> = {}): UsuarioAdmin {
  return {
    id: 7,
    correo: 'ana@demo.com',
    nombre: 'Ana López',
    activo: true,
    bloqueado: false,
    roles: ['CIUDADANO'],
    creadoEn: '2026-10-21T10:00:00Z',
    actualizadoEn: '2026-10-21T10:00:00Z',
    ...extra,
  }
}

const YO = usuario({
  id: 4,
  correo: 'admin@demo.com',
  nombre: 'Ada Admin',
  roles: ['ADMINISTRADOR'],
})
const ANA = usuario()
const BETO = usuario({
  id: 8,
  nombre: 'Beto Gómez',
  correo: 'beto@demo.com',
  roles: ['GESTOR'],
  activo: false,
})
const CARLA = usuario({
  id: 9,
  nombre: 'Carla Ruiz',
  correo: 'carla@demo.com',
  roles: ['GESTOR', 'CIUDADANO'],
  bloqueado: true,
})

const USUARIOS = [YO, ANA, BETO, CARLA]
const LISTA = {
  'GET /api/usuarios': () => json(pagina(USUARIOS)),
  'GET /api/roles': () => json(ROLES),
}

function llamadasA(llamadas: Llamada[], metodo: string, ruta: string): Llamada[] {
  return llamadas.filter((l) => l.metodo === metodo && l.ruta.split('?')[0] === ruta)
}

beforeEach(() => limpiarSesion())
afterEach(() => vi.unstubAllGlobals())

describe('lista de usuarios', () => {
  it('muestra nombre, correo, roles y estado de cada persona, y marca la cuenta propia', async () => {
    simularSesion(ADMIN, LISTA)

    renderizarApp('/usuarios')

    const tabla = await screen.findByRole('table', { name: 'Usuarios' })
    const filas = within(tabla).getAllByRole('row')
    expect(filas).toHaveLength(5)
    expect(within(filas[1]).getByText('Ada Admin (tú)')).toBeInTheDocument()
    expect(within(filas[2]).getByText('Ana López')).toBeInTheDocument()
    expect(within(filas[2]).getByText('ana@demo.com')).toBeInTheDocument()
    expect(within(filas[2]).getByText('CIUDADANO')).toBeInTheDocument()
    expect(within(filas[2]).getByText('Activa')).toBeInTheDocument()
    expect(within(filas[3]).getByText('Inactiva')).toBeInTheDocument()
    // Varios roles: una insignia por rol
    expect(within(filas[4]).getByText('GESTOR')).toBeInTheDocument()
    expect(within(filas[4]).getByText('CIUDADANO')).toBeInTheDocument()
    expect(within(filas[4]).getByText('Bloqueada')).toBeInTheDocument()
    expect(screen.queryByText('Ana López (tú)')).not.toBeInTheDocument()
  })

  it('los filtros y la página quedan en la dirección y se piden a la API', async () => {
    const usuarioUI = userEvent.setup()
    const llamadas = simularSesion(ADMIN, LISTA)

    renderizarApp('/usuarios')
    await screen.findByRole('table', { name: 'Usuarios' })
    await usuarioUI.type(screen.getByLabelText('Buscar por nombre o correo'), ' ana ')
    await usuarioUI.selectOptions(screen.getByLabelText('Rol'), 'GESTOR')
    await usuarioUI.selectOptions(screen.getByLabelText('Estado'), 'Inactivos')
    await usuarioUI.click(screen.getByRole('button', { name: 'Filtrar' }))

    await vi.waitFor(() => {
      const ultima = llamadasA(llamadas, 'GET', '/api/usuarios').at(-1)!.ruta
      expect(ultima).toMatch(/buscar=ana(&|$)/)
      expect(ultima).toMatch(/rol=GESTOR/)
      expect(ultima).toMatch(/activo=false/)
    })
  })

  it('entrar con filtros en la dirección pide justo eso, y "Limpiar" los quita', async () => {
    const usuarioUI = userEvent.setup()
    const llamadas = simularSesion(ADMIN, LISTA)

    renderizarApp('/usuarios?buscar=beto&rol=GESTOR&activo=true&page=2')
    await screen.findByRole('table', { name: 'Usuarios' })
    const primera = llamadasA(llamadas, 'GET', '/api/usuarios')[0].ruta
    expect(primera).toMatch(/buscar=beto/)
    expect(primera).toMatch(/rol=GESTOR/)
    expect(primera).toMatch(/activo=true/)
    expect(primera).toMatch(/page=2/)
    expect(screen.getByLabelText('Buscar por nombre o correo')).toHaveValue('beto')

    await usuarioUI.click(screen.getByRole('button', { name: 'Limpiar' }))

    await vi.waitFor(() => {
      const ultima = llamadasA(llamadas, 'GET', '/api/usuarios').at(-1)!.ruta
      expect(ultima).not.toMatch(/buscar=|rol=|activo=/)
    })
    expect(screen.getByLabelText('Buscar por nombre o correo')).toHaveValue('')
  })

  it('ignora un valor de estado que no es true ni false', async () => {
    const llamadas = simularSesion(ADMIN, LISTA)

    renderizarApp('/usuarios?activo=quizas')

    await screen.findByRole('table', { name: 'Usuarios' })
    expect(llamadasA(llamadas, 'GET', '/api/usuarios')[0].ruta).not.toMatch(/activo=/)
  })

  it('con filtros y sin resultados lo dice, sin culpar a que no haya usuarios', async () => {
    simularSesion(ADMIN, { ...LISTA, 'GET /api/usuarios': () => json(pagina([])) })

    renderizarApp('/usuarios?buscar=zzz')

    expect(
      await screen.findByText('No hay usuarios que coincidan con los filtros.'),
    ).toBeInTheDocument()
  })

  it('quien no puede leer roles (el gestor) ve la lista igual, sin filtro por rol y sin error', async () => {
    simularSesion(GESTOR_CON_USUARIOS, {
      'GET /api/usuarios': () => json(pagina(USUARIOS)),
      'GET /api/roles': () => problema(403, 'No tienes permiso para hacer esto.'),
    })

    renderizarApp('/usuarios')

    await screen.findByRole('table', { name: 'Usuarios' })
    expect(screen.queryByLabelText('Rol')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Estado')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    // Tampoco se le ofrece un enlace a una pantalla que le daría "Sin permiso"
    expect(screen.queryByRole('link', { name: 'Ver qué permite cada rol' })).not.toBeInTheDocument()
  })

  it('si la lista falla muestra el error y deja reintentar', async () => {
    const usuarioUI = userEvent.setup()
    let intentos = 0
    simularSesion(ADMIN, {
      ...LISTA,
      'GET /api/usuarios': () =>
        ++intentos === 1 ? problema(500, 'detalle interno') : json(pagina(USUARIOS)),
    })

    renderizarApp('/usuarios')

    expect(await screen.findByRole('alert')).toHaveTextContent(/error inesperado/)
    expect(screen.queryByText('detalle interno')).not.toBeInTheDocument()
    await usuarioUI.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Ana López')).toBeInTheDocument()
  })
})

describe('permisos de la lista', () => {
  it('quien solo consulta (auditor) ve la lista sin acciones ni "Nuevo usuario", con el enlace a los roles', async () => {
    simularSesion(AUDITOR, LISTA)

    renderizarApp('/usuarios')

    await screen.findByRole('table', { name: 'Usuarios' })
    expect(screen.queryByRole('columnheader', { name: 'Acciones' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Editar/ })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^Desactivar|^Activar|^Desbloquear/ }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Nuevo usuario' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver qué permite cada rol' })).toHaveAttribute(
      'href',
      '/roles',
    )
  })

  it('el administrador ve todas las acciones', async () => {
    simularSesion(ADMIN, LISTA)

    renderizarApp('/usuarios')

    await screen.findByRole('table', { name: 'Usuarios' })
    expect(screen.getByRole('link', { name: 'Nuevo usuario' })).toHaveAttribute(
      'href',
      '/usuarios/nuevo',
    )
    expect(screen.getByRole('link', { name: 'Editar a Ana López' })).toHaveAttribute(
      'href',
      '/usuarios/7/editar',
    )
    expect(screen.getByRole('button', { name: 'Desactivar a Ana López' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Activar a Beto Gómez' })).toBeEnabled()
  })

  it('sin usuario:leer la lista es "Sin permiso" y no se llama a la API', async () => {
    const llamadas = simularSesion({ ...ADMIN, permisos: ['rol:leer'] }, LISTA)

    renderizarApp('/usuarios')

    expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument()
    expect(llamadasA(llamadas, 'GET', '/api/usuarios')).toHaveLength(0)
  })

  it.each(['/usuarios/nuevo', '/usuarios/7/editar'])(
    '%s exige su permiso aunque pueda consultar',
    async (ruta) => {
      const llamadas = simularSesion(AUDITOR, LISTA)

      renderizarApp(ruta)

      expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument()
      expect(llamadasA(llamadas, 'GET', '/api/usuarios/7')).toHaveLength(0)
    },
  )

  it('crear exige usuario:crear aunque pueda editar', async () => {
    simularSesion({ ...ADMIN, permisos: ['usuario:leer', 'usuario:editar', 'rol:leer'] }, LISTA)

    renderizarApp('/usuarios/nuevo')

    expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument()
  })

  it('el menú muestra "Usuarios" y "Roles" según el permiso de cada uno', async () => {
    simularSesion({ ...ADMIN, permisos: ['usuario:leer'] }, LISTA)
    const { unmount } = renderizarApp('/panel')
    const menu = await screen.findByRole('navigation', { name: /principal/i })
    expect(within(menu).getByRole('link', { name: 'Usuarios' })).toHaveAttribute(
      'href',
      '/usuarios',
    )
    expect(within(menu).queryByRole('link', { name: 'Roles' })).not.toBeInTheDocument()
    unmount()

    limpiarSesion()
    vi.unstubAllGlobals()
    simularSesion({ ...ADMIN, permisos: ['rol:leer'] }, LISTA)
    renderizarApp('/panel')
    const menu2 = await screen.findByRole('navigation', { name: /principal/i })
    expect(within(menu2).getByRole('link', { name: 'Roles' })).toHaveAttribute('href', '/roles')
    expect(within(menu2).queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument()
  })
})

describe('activar, desactivar y desbloquear', () => {
  it('desactivar manda el nombre, activo en falso y los roles que ya tiene', async () => {
    const usuarioUI = userEvent.setup()
    const llamadas = simularSesion(ADMIN, {
      ...LISTA,
      'PUT /api/usuarios/9': () => json({ ...CARLA, activo: false }),
    })

    renderizarApp('/usuarios')
    await usuarioUI.click(await screen.findByRole('button', { name: 'Desactivar a Carla Ruiz' }))

    expect(await screen.findByText('Desactivamos la cuenta de Carla Ruiz.')).toBeInTheDocument()
    const put = llamadasA(llamadas, 'PUT', '/api/usuarios/9')
    expect(put).toHaveLength(1)
    expect(put[0].cuerpo).toEqual({
      nombre: 'Carla Ruiz',
      activo: false,
      roles: ['GESTOR', 'CIUDADANO'],
    })
    // Vuelve a pedir la lista para mostrar el cambio
    expect(llamadasA(llamadas, 'GET', '/api/usuarios').length).toBeGreaterThanOrEqual(2)
  })

  it('activar manda activo en verdadero', async () => {
    const usuarioUI = userEvent.setup()
    const llamadas = simularSesion(ADMIN, {
      ...LISTA,
      'PUT /api/usuarios/8': () => json({ ...BETO, activo: true }),
    })

    renderizarApp('/usuarios')
    await usuarioUI.click(await screen.findByRole('button', { name: 'Activar a Beto Gómez' }))

    expect(await screen.findByText('Activamos la cuenta de Beto Gómez.')).toBeInTheDocument()
    expect(llamadasA(llamadas, 'PUT', '/api/usuarios/8')[0].cuerpo).toEqual({
      nombre: 'Beto Gómez',
      activo: true,
      roles: ['GESTOR'],
    })
  })

  it('nadie puede desactivar su propia cuenta: el botón de la fila propia está desactivado', async () => {
    const usuarioUI = userEvent.setup()
    const llamadas = simularSesion(ADMIN, LISTA)

    renderizarApp('/usuarios')
    const propio = await screen.findByRole('button', { name: 'Desactivar a Ada Admin' })

    expect(propio).toBeDisabled()
    await usuarioUI.click(propio)
    expect(llamadasA(llamadas, 'PUT', '/api/usuarios/4')).toHaveLength(0)
  })

  it('si la API rechaza el cambio muestra el motivo y no dice que funcionó', async () => {
    const usuarioUI = userEvent.setup()
    simularSesion(ADMIN, {
      ...LISTA,
      'PUT /api/usuarios/7': () =>
        problema(409, 'No puedes cambiar tus propios roles ni desactivar tu propia cuenta'),
    })

    renderizarApp('/usuarios')
    await usuarioUI.click(await screen.findByRole('button', { name: 'Desactivar a Ana López' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /No puedes cambiar tus propios roles/,
    )
    expect(screen.queryByText(/Desactivamos/)).not.toBeInTheDocument()
  })

  it('mientras se guarda un cambio no se pueden mandar otros', async () => {
    const usuarioUI = userEvent.setup()
    let liberar: (r: Response) => void = () => {}
    simularSesion(ADMIN, {
      ...LISTA,
      'PUT /api/usuarios/7': () => new Promise<Response>((resolver) => (liberar = resolver)),
    })

    renderizarApp('/usuarios')
    await usuarioUI.click(await screen.findByRole('button', { name: 'Desactivar a Ana López' }))

    expect(screen.getByRole('button', { name: 'Activar a Beto Gómez' })).toBeDisabled()
    liberar(json({ ...ANA, activo: false }))
    expect(await screen.findByText('Desactivamos la cuenta de Ana López.')).toBeInTheDocument()
  })

  it('"Desbloquear" aparece solo en las cuentas bloqueadas y llama a la API', async () => {
    const usuarioUI = userEvent.setup()
    const llamadas = simularSesion(ADMIN, {
      ...LISTA,
      'POST /api/usuarios/9/desbloquear': () => json({ ...CARLA, bloqueado: false }),
    })

    renderizarApp('/usuarios')
    await screen.findByRole('table', { name: 'Usuarios' })
    expect(screen.getAllByRole('button', { name: /^Desbloquear/ })).toHaveLength(1)
    await usuarioUI.click(screen.getByRole('button', { name: 'Desbloquear a Carla Ruiz' }))

    expect(await screen.findByText('Desbloqueamos la cuenta de Carla Ruiz.')).toBeInTheDocument()
    expect(llamadasA(llamadas, 'POST', '/api/usuarios/9/desbloquear')).toHaveLength(1)
  })
})

describe('crear un usuario', () => {
  async function escribir(etiqueta: string, texto: string) {
    const usuarioUI = userEvent.setup()
    await usuarioUI.clear(screen.getByLabelText(etiqueta))
    await usuarioUI.type(screen.getByLabelText(etiqueta), texto)
  }

  it('manda lo escrito con los roles elegidos y vuelve a la lista con aviso', async () => {
    const usuarioUI = userEvent.setup()
    const llamadas = simularSesion(ADMIN, {
      ...LISTA,
      'POST /api/usuarios': () => json(usuario({ id: 20, nombre: 'Rosa Pérez' }), 201),
    })

    renderizarApp('/usuarios/nuevo')
    await screen.findByRole('button', { name: 'Crear usuario' })
    await escribir('Nombre', ' Rosa Pérez ')
    await escribir('Correo', 'rosa@demo.com')
    await escribir('Clave inicial', 'ClaveSegura1')
    await usuarioUI.click(await screen.findByRole('checkbox', { name: 'GESTOR' }))
    await usuarioUI.click(screen.getByRole('checkbox', { name: 'CIUDADANO' }))
    await usuarioUI.click(screen.getByRole('button', { name: 'Crear usuario' }))

    expect(await screen.findByText('Creamos la cuenta de Rosa Pérez.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Usuarios' })).toBeInTheDocument()
    expect(llamadasA(llamadas, 'POST', '/api/usuarios')[0].cuerpo).toEqual({
      nombre: 'Rosa Pérez',
      correo: 'rosa@demo.com',
      clave: 'ClaveSegura1',
      roles: ['GESTOR', 'CIUDADANO'],
    })
  })

  it('la clave se escribe en un campo de contraseña y no se autocompleta', async () => {
    simularSesion(ADMIN, LISTA)

    renderizarApp('/usuarios/nuevo')

    const clave = await screen.findByLabelText('Clave inicial')
    expect(clave).toHaveAttribute('type', 'password')
    expect(clave).toHaveAttribute('autocomplete', 'new-password')
  })

  it('un formulario vacío muestra los errores junto a cada campo y no llama a la API', async () => {
    const usuarioUI = userEvent.setup()
    const llamadas = simularSesion(ADMIN, LISTA)

    renderizarApp('/usuarios/nuevo')
    await screen.findByRole('button', { name: 'Crear usuario' })
    await usuarioUI.click(screen.getByRole('button', { name: 'Crear usuario' }))

    expect(screen.getByText('Escribe el nombre.')).toBeInTheDocument()
    expect(screen.getByText('Escribe el correo.')).toBeInTheDocument()
    expect(screen.getByText('Escribe una clave.')).toBeInTheDocument()
    expect(screen.getByText('Elige al menos un rol.')).toBeInTheDocument()
    expect(screen.getByLabelText('Correo')).toHaveAttribute('aria-invalid', 'true')
    expect(llamadasA(llamadas, 'POST', '/api/usuarios')).toHaveLength(0)
  })

  it('un correo repetido (409) se muestra en un aviso y no repite la clave escrita', async () => {
    const usuarioUI = userEvent.setup()
    simularSesion(ADMIN, {
      ...LISTA,
      'POST /api/usuarios': () => problema(409, 'El correo ya esta registrado'),
    })

    renderizarApp('/usuarios/nuevo')
    await screen.findByRole('button', { name: 'Crear usuario' })
    await escribir('Nombre', 'Rosa')
    await escribir('Correo', 'ana@demo.com')
    await escribir('Clave inicial', 'ClaveSecreta99')
    await usuarioUI.click(await screen.findByRole('checkbox', { name: 'CIUDADANO' }))
    await usuarioUI.click(screen.getByRole('button', { name: 'Crear usuario' }))

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('El correo ya esta registrado')
    expect(document.body).not.toHaveTextContent('ClaveSecreta99')
    // El formulario sigue con lo escrito
    expect(screen.getByLabelText('Nombre')).toHaveValue('Rosa')
  })

  it('los errores por campo de la API aparecen junto a su campo, sin aviso duplicado', async () => {
    const usuarioUI = userEvent.setup()
    simularSesion(ADMIN, {
      ...LISTA,
      'POST /api/usuarios': () =>
        problema(400, 'La solicitud tiene campos invalidos', [
          {
            campo: 'correo',
            motivo: 'debe ser una dirección de correo electrónico con formato correcto',
          },
          { campo: 'roles', motivo: 'No existe el rol FANTASMA' },
        ]),
    })

    renderizarApp('/usuarios/nuevo')
    await screen.findByRole('button', { name: 'Crear usuario' })
    await escribir('Nombre', 'Rosa')
    await escribir('Correo', 'rosa@demo.com')
    await escribir('Clave inicial', 'ClaveSegura1')
    await usuarioUI.click(await screen.findByRole('checkbox', { name: 'CIUDADANO' }))
    await usuarioUI.click(screen.getByRole('button', { name: 'Crear usuario' }))

    expect(await screen.findByText(/formato correcto/)).toBeInTheDocument()
    expect(screen.getByText('No existe el rol FANTASMA')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('si no se pueden cargar los roles lo dice y deja volver', async () => {
    simularSesion(ADMIN, {
      ...LISTA,
      'GET /api/roles': () => problema(403, 'No tienes permiso para hacer esto.'),
    })

    renderizarApp('/usuarios/nuevo')

    expect(await screen.findByRole('alert')).toHaveTextContent(/No tienes permiso/)
    expect(screen.getByRole('link', { name: 'Volver a los usuarios' })).toHaveAttribute(
      'href',
      '/usuarios',
    )
    expect(screen.queryByRole('button', { name: 'Crear usuario' })).not.toBeInTheDocument()
  })

  it('el botón se bloquea mientras se guarda para no crear la cuenta dos veces', async () => {
    const usuarioUI = userEvent.setup()
    let liberar: (r: Response) => void = () => {}
    const llamadas = simularSesion(ADMIN, {
      ...LISTA,
      'POST /api/usuarios': () => new Promise<Response>((resolver) => (liberar = resolver)),
    })

    renderizarApp('/usuarios/nuevo')
    await screen.findByRole('button', { name: 'Crear usuario' })
    await escribir('Nombre', 'Rosa')
    await escribir('Correo', 'rosa@demo.com')
    await escribir('Clave inicial', 'ClaveSegura1')
    await usuarioUI.click(await screen.findByRole('checkbox', { name: 'CIUDADANO' }))
    await usuarioUI.click(screen.getByRole('button', { name: 'Crear usuario' }))

    const guardando = await screen.findByRole('button', { name: 'Guardando...' })
    expect(guardando).toBeDisabled()
    await usuarioUI.click(guardando)
    expect(llamadasA(llamadas, 'POST', '/api/usuarios')).toHaveLength(1)
    liberar(json(usuario({ nombre: 'Rosa' }), 201))
    expect(await screen.findByText('Creamos la cuenta de Rosa.')).toBeInTheDocument()
  })
})

describe('editar un usuario', () => {
  const RUTAS = { ...LISTA, 'GET /api/usuarios/7': () => json(ANA) }

  it('carga al usuario con sus roles marcados y guarda lo cambiado', async () => {
    const usuarioUI = userEvent.setup()
    const llamadas = simularSesion(ADMIN, {
      ...RUTAS,
      'PUT /api/usuarios/7': () => json({ ...ANA, roles: ['GESTOR'] }),
    })

    renderizarApp('/usuarios/7/editar')

    expect(await screen.findByRole('heading', { name: 'Editar a Ana López' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana López')
    expect(screen.getByText('ana@demo.com')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Cuenta activa/)).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'CIUDADANO' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'GESTOR' })).not.toBeChecked()

    await usuarioUI.click(screen.getByRole('checkbox', { name: 'GESTOR' }))
    await usuarioUI.click(screen.getByRole('checkbox', { name: 'CIUDADANO' }))
    await usuarioUI.click(screen.getByLabelText(/^Cuenta activa/))
    await usuarioUI.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Guardamos los cambios de Ana López.')).toBeInTheDocument()
    expect(llamadasA(llamadas, 'PUT', '/api/usuarios/7')[0].cuerpo).toEqual({
      nombre: 'Ana López',
      activo: false,
      roles: ['GESTOR'],
    })
  })

  it('no se puede quitar el último rol: avisa y no llama a la API', async () => {
    const usuarioUI = userEvent.setup()
    const llamadas = simularSesion(ADMIN, RUTAS)

    renderizarApp('/usuarios/7/editar')
    await usuarioUI.click(await screen.findByRole('checkbox', { name: 'CIUDADANO' }))
    await usuarioUI.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(screen.getByText('Elige al menos un rol.')).toBeInTheDocument()
    expect(llamadasA(llamadas, 'PUT', '/api/usuarios/7')).toHaveLength(0)
  })

  it('cada rol deja ver sus permisos agrupados y en orden natural', async () => {
    simularSesion(ADMIN, RUTAS)

    renderizarApp('/usuarios/7/editar')

    await screen.findByRole('heading', { name: 'Editar a Ana López' })
    const gestor = screen.getByText('Ver permisos de GESTOR').closest('details')!
    expect(within(gestor).getByText('Pagos').parentElement).toHaveTextContent(
      'Pagosconsultar, editar',
    )
    expect(within(gestor).getByText('Trámites').parentElement).toHaveTextContent(
      'Trámitesconsultar, editar',
    )
    const admin = screen.getByText('Ver permisos de ADMINISTRADOR').closest('details')!
    expect(within(admin).getByText('consultar, crear', { selector: 'dd' })).toBeInTheDocument()
    expect(screen.getByText('Ve solo sus propios registros.')).toBeInTheDocument()
  })

  it('en la cuenta propia no se pueden cambiar los roles ni desactivarla, y se explica por qué', async () => {
    const usuarioUI = userEvent.setup()
    const llamadas = simularSesion(ADMIN, {
      ...LISTA,
      'GET /api/usuarios/4': () => json(YO),
      'PUT /api/usuarios/4': () => json({ ...YO, nombre: 'Ada Admin 2' }),
    })

    renderizarApp('/usuarios/4/editar')

    expect(await screen.findByText(/Es tu propia cuenta/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Cuenta activa/)).toBeDisabled()
    for (const rol of ['ADMINISTRADOR', 'GESTOR', 'CIUDADANO']) {
      expect(screen.getByRole('checkbox', { name: rol })).toBeDisabled()
    }
    // El nombre sí se puede cambiar, y los roles y el estado viajan sin cambios
    await usuarioUI.clear(screen.getByLabelText('Nombre'))
    await usuarioUI.type(screen.getByLabelText('Nombre'), 'Ada Admin 2')
    await usuarioUI.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Guardamos los cambios de Ada Admin 2.')).toBeInTheDocument()
    expect(llamadasA(llamadas, 'PUT', '/api/usuarios/4')[0].cuerpo).toEqual({
      nombre: 'Ada Admin 2',
      activo: true,
      roles: ['ADMINISTRADOR'],
    })
  })

  it('en otra cuenta no aparece el aviso de cuenta propia y todo se puede cambiar', async () => {
    simularSesion(ADMIN, RUTAS)

    renderizarApp('/usuarios/7/editar')

    await screen.findByRole('heading', { name: 'Editar a Ana López' })
    expect(screen.queryByText(/Es tu propia cuenta/)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/^Cuenta activa/)).toBeEnabled()
    expect(screen.getByRole('checkbox', { name: 'GESTOR' })).toBeEnabled()
  })

  it('si la API rechaza el cambio (409) lo muestra en un aviso', async () => {
    const usuarioUI = userEvent.setup()
    simularSesion(ADMIN, {
      ...RUTAS,
      'PUT /api/usuarios/7': () =>
        problema(409, 'No puedes cambiar tus propios roles ni desactivar tu propia cuenta'),
    })

    renderizarApp('/usuarios/7/editar')
    await usuarioUI.click(await screen.findByRole('checkbox', { name: 'GESTOR' }))
    await usuarioUI.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /No puedes cambiar tus propios roles/,
    )
    expect(screen.getByRole('heading', { name: 'Editar a Ana López' })).toBeInTheDocument()
  })

  it('un usuario que no existe muestra el error de la API y un enlace para volver', async () => {
    simularSesion(ADMIN, {
      ...LISTA,
      'GET /api/usuarios/77': () => problema(404, 'El usuario no existe'),
    })

    renderizarApp('/usuarios/77/editar')

    expect(await screen.findByRole('alert')).toHaveTextContent('El usuario no existe')
    expect(screen.getByRole('link', { name: 'Volver a los usuarios' })).toHaveAttribute(
      'href',
      '/usuarios',
    )
  })

  it.each(['abc', '0', '-3', '1.5'])(
    'la dirección /usuarios/%s/editar es "no encontrada"',
    async (id) => {
      const llamadas = simularSesion(ADMIN, LISTA)

      renderizarApp(`/usuarios/${id}/editar`)

      expect(
        await screen.findByRole('heading', { name: 'Página no encontrada' }),
      ).toBeInTheDocument()
      expect(llamadasA(llamadas, 'GET', `/api/usuarios/${id}`)).toHaveLength(0)
    },
  )
})

describe('roles y permisos', () => {
  it('muestra cada rol con su descripción, su alcance y sus permisos agrupados', async () => {
    simularSesion(AUDITOR, LISTA)

    renderizarApp('/roles')

    expect(await screen.findByRole('heading', { name: 'Roles y permisos' })).toBeInTheDocument()
    const gestor = await screen.findByRole('region', { name: 'GESTOR' })
    expect(within(gestor).getByText('Revisa trámites')).toBeInTheDocument()
    expect(within(gestor).getByText('Ve los registros de todas las personas.')).toBeInTheDocument()
    expect(within(gestor).getByText('Pagos')).toBeInTheDocument()
    expect(within(gestor).getByText('Pagos').parentElement).toHaveTextContent(
      'Pagosconsultar, editar',
    )
    const ciudadano = screen.getByRole('region', { name: 'CIUDADANO' })
    expect(within(ciudadano).getByText('Ve solo sus propios registros.')).toBeInTheDocument()
    expect(within(ciudadano).getByText('consultar, crear', { selector: 'dd' })).toBeInTheDocument()
  })

  it('quien no puede leer roles ve "Sin permiso" y no se llama a la API', async () => {
    const llamadas = simularSesion(GESTOR_CON_USUARIOS, LISTA)

    renderizarApp('/roles')

    expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument()
    expect(llamadasA(llamadas, 'GET', '/api/roles')).toHaveLength(0)
  })

  it('si falla muestra el error y deja reintentar', async () => {
    const usuarioUI = userEvent.setup()
    let intentos = 0
    simularSesion(AUDITOR, {
      'GET /api/roles': () => (++intentos === 1 ? problema(500, 'interno') : json(ROLES)),
    })

    renderizarApp('/roles')

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await usuarioUI.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('region', { name: 'GESTOR' })).toBeInTheDocument()
  })

  it('sin roles lo dice', async () => {
    simularSesion(AUDITOR, { 'GET /api/roles': () => json([]) })

    renderizarApp('/roles')

    expect(await screen.findByText('No hay roles registrados.')).toBeInTheDocument()
  })
})
