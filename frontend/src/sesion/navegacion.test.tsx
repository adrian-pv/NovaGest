import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Menu from '../componentes/Menu'
import { json, PERFIL_CIUDADANA, simularApi, tokens } from '../test/api-simulada'
import { limpiarSesion, renderizarApp } from '../test/utilidades'
import { guardarRenovacion } from './almacen'
import { capacidadesDe } from './capacidades'
import { ITEMS_MENU, itemsVisibles, type ItemMenu } from './navegacion'
import { ProveedorSesion } from './ProveedorSesion'

beforeEach(() => {
  limpiarSesion()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const ITEMS: ItemMenu[] = [
  { ruta: '/', etiqueta: 'Inicio' },
  { ruta: '/panel', etiqueta: 'Mi panel', requiereSesion: true },
  { ruta: '/tramites', etiqueta: 'Trámites', permiso: 'tramite:leer' },
  { ruta: '/bitacora', etiqueta: 'Bitácora', permiso: 'bitacora:leer' },
]

describe('itemsVisibles', () => {
  const sinPermisos = () => false

  it('sin sesión solo ve lo público', () => {
    const rutas = itemsVisibles(ITEMS, { autenticado: false, tienePermiso: () => true }).map(
      (i) => i.ruta,
    )

    expect(rutas).toEqual(['/'])
  })

  it('con sesión ve lo que pide sesión pero no lo que exige un permiso que no tiene', () => {
    const rutas = itemsVisibles(ITEMS, { autenticado: true, tienePermiso: sinPermisos }).map(
      (i) => i.ruta,
    )

    expect(rutas).toEqual(['/', '/panel'])
  })

  it('ve cada elemento solo si tiene su permiso', () => {
    const rutas = itemsVisibles(ITEMS, {
      autenticado: true,
      tienePermiso: (p) => p === 'tramite:leer',
    }).map((i) => i.ruta)

    expect(rutas).toEqual(['/', '/panel', '/tramites'])
  })

  it('el menú real siempre incluye el inicio y el panel para quien tiene sesión', () => {
    const rutas = itemsVisibles(ITEMS_MENU, { autenticado: true, tienePermiso: sinPermisos }).map(
      (i) => i.ruta,
    )

    expect(rutas).toEqual(expect.arrayContaining(['/', '/panel']))
  })
})

describe('Menu según el rol', () => {
  function dibujar(permisos: string[]) {
    guardarRenovacion('renovacion-guardada')
    simularApi({
      'POST /api/auth/refresh': () => json(tokens('1')),
      'GET /api/usuarios/yo': () => json({ ...PERFIL_CIUDADANA, permisos }),
    })
    render(
      <MemoryRouter>
        <ProveedorSesion>
          <Menu items={ITEMS} />
        </ProveedorSesion>
      </MemoryRouter>,
    )
  }

  it('un auditor ve la bitácora y un ciudadano no', async () => {
    dibujar(['tramite:leer', 'bitacora:leer'])

    const menu = within(await screen.findByRole('navigation', { name: 'Principal' }))
    expect(await menu.findByRole('link', { name: 'Bitácora' })).toBeInTheDocument()
    expect(menu.getByRole('link', { name: 'Trámites' })).toBeInTheDocument()
  })

  it('con solo el permiso de trámites no aparece la bitácora', async () => {
    dibujar(['tramite:leer'])

    const menu = within(await screen.findByRole('navigation', { name: 'Principal' }))
    expect(await menu.findByRole('link', { name: 'Trámites' })).toBeInTheDocument()
    expect(menu.queryByRole('link', { name: 'Bitácora' })).not.toBeInTheDocument()
  })

  it('marca la página actual', async () => {
    simularApi({})
    render(
      <MemoryRouter initialEntries={['/']}>
        <ProveedorSesion>
          <Menu items={ITEMS} />
        </ProveedorSesion>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('link', { name: 'Inicio' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})

describe('marco de la página (Diseno)', () => {
  it('sin sesión ofrece entrar o crear cuenta y no muestra "Cerrar sesión"', async () => {
    simularApi({})

    renderizarApp('/ingresar')

    const cabecera = within(await screen.findByRole('banner'))
    expect(cabecera.getByRole('link', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(cabecera.getByRole('link', { name: 'Crear cuenta' })).toBeInTheDocument()
    expect(cabecera.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument()
  })

  it('con sesión muestra el nombre y el rol y permite cerrar sesión', async () => {
    guardarRenovacion('renovacion-guardada')
    simularApi({
      'POST /api/auth/refresh': () => json(tokens('1')),
      'GET /api/usuarios/yo': () => json(PERFIL_CIUDADANA),
    })

    renderizarApp('/panel')

    const cabecera = within(await screen.findByRole('banner'))
    expect(await cabecera.findByText('Ana López')).toBeInTheDocument()
    expect(cabecera.getByText('CIUDADANO')).toBeInTheDocument()
    expect(cabecera.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
    expect(cabecera.queryByRole('link', { name: 'Iniciar sesión' })).not.toBeInTheDocument()
  })

  it('tiene un enlace para saltar al contenido y un solo contenido principal', async () => {
    simularApi({})

    renderizarApp('/ingresar')

    expect(await screen.findByRole('link', { name: 'Saltar al contenido' })).toHaveAttribute(
      'href',
      '#contenido',
    )
    expect(screen.getAllByRole('main')).toHaveLength(1)
  })
})

describe('panel según el rol', () => {
  it('un ciudadano ve lo suyo y no ve las acciones de gestión ni de auditoría', async () => {
    guardarRenovacion('renovacion-guardada')
    simularApi({
      'POST /api/auth/refresh': () => json(tokens('1')),
      'GET /api/usuarios/yo': () => json(PERFIL_CIUDADANA),
    })

    renderizarApp('/panel')

    expect(await screen.findByText('Crear y enviar trámites')).toBeInTheDocument()
    expect(screen.getByText('Consultar y dar seguimiento a tus trámites')).toBeInTheDocument()
    expect(screen.queryByText(/Validar o rechazar pagos/)).not.toBeInTheDocument()
    expect(screen.queryByText(/bitácora/i)).not.toBeInTheDocument()
  })

  it('un gestor ve la revisión de trámites y la validación de pagos', async () => {
    guardarRenovacion('renovacion-guardada')
    simularApi({
      'POST /api/auth/refresh': () => json(tokens('1')),
      'GET /api/usuarios/yo': () =>
        json({
          ...PERFIL_CIUDADANA,
          nombre: 'Gabriel Gestor',
          roles: ['GESTOR'],
          permisos: ['tramite:leer', 'tramite:editar', 'pago:leer', 'pago:editar'],
          alcanceTotal: true,
        }),
    })

    renderizarApp('/panel')

    expect(await screen.findByText(/Revisar trámites/)).toBeInTheDocument()
    expect(screen.getByText('Validar o rechazar pagos')).toBeInTheDocument()
    expect(screen.getByText('Consultar los trámites de todas las personas')).toBeInTheDocument()
    expect(screen.queryByText('Crear y enviar trámites')).not.toBeInTheDocument()
  })

  it('un rol sin permisos conocidos recibe una explicación en vez de una lista vacía', async () => {
    guardarRenovacion('renovacion-guardada')
    simularApi({
      'POST /api/auth/refresh': () => json(tokens('1')),
      'GET /api/usuarios/yo': () => json({ ...PERFIL_CIUDADANA, permisos: [] }),
    })

    renderizarApp('/panel')

    expect(await screen.findByText(/no tiene acciones habilitadas/)).toBeInTheDocument()
  })

  it('capacidadesDe distingue el alcance propio del total', () => {
    const propio = capacidadesDe({
      ...PERFIL_CIUDADANA,
      permisos: ['tramite:leer'],
      alcanceTotal: false,
    })
    const total = capacidadesDe({
      ...PERFIL_CIUDADANA,
      permisos: ['tramite:leer'],
      alcanceTotal: true,
    })

    expect(propio).toEqual(['Consultar y dar seguimiento a tus trámites'])
    expect(total).toEqual(['Consultar los trámites de todas las personas'])
  })
})
