import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { leerToken } from '../api/token'
import { json, PERFIL_CIUDADANA, problema, simularApi, tokens } from '../test/api-simulada'
import { limpiarSesion, renderizarApp } from '../test/utilidades'
import { guardarRenovacion, leerRenovacion } from './almacen'
import { ProveedorSesion } from './ProveedorSesion'
import RutaProtegida from './RutaProtegida'

beforeEach(() => {
  limpiarSesion()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function iniciarSesionComoAna(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.type(await screen.findByLabelText('Correo'), 'ana@demo.com')
  await usuario.type(screen.getByLabelText('Contraseña'), 'clave-segura-123')
  await usuario.click(screen.getByRole('button', { name: 'Ingresar' }))
}

describe('inicio de sesión', () => {
  it('entra al panel, guarda el acceso en memoria y la renovación en la pestaña', async () => {
    const llamadas = simularApi({
      'POST /api/auth/login': () => json(tokens('1')),
      'GET /api/usuarios/yo': () => json(PERFIL_CIUDADANA),
    })
    const usuario = userEvent.setup()
    renderizarApp('/ingresar')

    await iniciarSesionComoAna(usuario)

    expect(await screen.findByRole('heading', { name: 'Hola, Ana López' })).toBeInTheDocument()
    expect(leerToken()).toBe('acceso-1')
    expect(leerRenovacion()).toBe('renovacion-1')
    expect(llamadas[0].cuerpo).toEqual({ correo: 'ana@demo.com', clave: 'clave-segura-123' })
    expect(llamadas[0].cabeceras.Authorization).toBeUndefined()
    // El perfil se pide con el token recién emitido
    expect(llamadas[1].cabeceras.Authorization).toBe('Bearer acceso-1')
  })

  it('nunca deja un token en localStorage ni el de acceso en sessionStorage', async () => {
    simularApi({
      'POST /api/auth/login': () => json(tokens('1')),
      'GET /api/usuarios/yo': () => json(PERFIL_CIUDADANA),
    })
    const usuario = userEvent.setup()
    renderizarApp('/ingresar')

    await iniciarSesionComoAna(usuario)
    await screen.findByRole('heading', { name: 'Hola, Ana López' })

    expect(JSON.stringify({ ...localStorage })).not.toMatch(/acceso-1|renovacion-1/)
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('acceso-1')
  })

  it('con credenciales malas muestra el mensaje del servidor, vacía la clave y no guarda nada', async () => {
    simularApi({ 'POST /api/auth/login': () => problema(401, 'Credenciales invalidas') })
    const usuario = userEvent.setup()
    renderizarApp('/ingresar')

    await iniciarSesionComoAna(usuario)

    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales invalidas')
    expect(screen.getByLabelText('Contraseña')).toHaveValue('')
    expect(leerToken()).toBeNull()
    expect(leerRenovacion()).toBeNull()
  })

  it('con la cuenta bloqueada o demasiados intentos muestra el aviso de espera', async () => {
    simularApi({ 'POST /api/auth/login': () => new Response(null, { status: 429 }) })
    const usuario = userEvent.setup()
    renderizarApp('/ingresar')

    await iniciarSesionComoAna(usuario)

    expect(await screen.findByRole('alert')).toHaveTextContent('Demasiados intentos')
  })

  it('no permite enviar el formulario vacío', async () => {
    simularApi({})
    renderizarApp('/ingresar')

    expect(await screen.findByRole('button', { name: 'Ingresar' })).toBeDisabled()
  })

  it('vuelve a la página que la persona quería ver antes de que le pidieran iniciar sesión', async () => {
    simularApi({
      'POST /api/auth/login': () => json(tokens('1')),
      'GET /api/usuarios/yo': () => json(PERFIL_CIUDADANA),
    })
    const usuario = userEvent.setup()
    renderizarApp('/panel')

    await iniciarSesionComoAna(usuario)

    expect(await screen.findByRole('heading', { name: 'Hola, Ana López' })).toBeInTheDocument()
  })
})

describe('recuperar la sesión al cargar la página', () => {
  it('con un token de renovación guardado renueva UNA sola vez, incluso en StrictMode, y entra al panel', async () => {
    guardarRenovacion('renovacion-guardada')
    const llamadas = simularApi({
      'POST /api/auth/refresh': () => json(tokens('2')),
      'GET /api/usuarios/yo': () => json(PERFIL_CIUDADANA),
    })

    renderizarApp('/panel')

    expect(await screen.findByRole('heading', { name: 'Hola, Ana López' })).toBeInTheDocument()
    expect(llamadas.filter((l) => l.ruta === '/api/auth/refresh')).toHaveLength(1)
    expect(leerRenovacion()).toBe('renovacion-2')
  })

  it('si el token guardado ya no sirve, termina en el inicio de sesión y borra lo guardado', async () => {
    guardarRenovacion('renovacion-usada')
    simularApi({ 'POST /api/auth/refresh': () => problema(401, 'Token de renovacion invalido') })

    renderizarApp('/panel')

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(leerRenovacion()).toBeNull()
  })

  it('sin nada guardado, una ruta protegida lleva al inicio de sesión sin llamar al servidor', async () => {
    const llamadas = simularApi({})

    renderizarApp('/panel')

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(llamadas).toHaveLength(0)
  })

  it('mientras recupera la sesión muestra un aviso en vez de mandar al login', async () => {
    guardarRenovacion('renovacion-guardada')
    let liberar: (r: Response) => void = () => undefined
    simularApi({
      'POST /api/auth/refresh': () => new Promise<Response>((resolver) => (liberar = resolver)),
      'GET /api/usuarios/yo': () => json(PERFIL_CIUDADANA),
    })

    renderizarApp('/panel')

    expect(await screen.findByText('Cargando sesión...')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Iniciar sesión' })).not.toBeInTheDocument()
    liberar(json(tokens('2')))
    expect(await screen.findByRole('heading', { name: 'Hola, Ana López' })).toBeInTheDocument()
  })
})

describe('sesión que vence mientras se usa', () => {
  it('una llamada con el token vencido renueva y reintenta sin que la persona lo note', async () => {
    guardarRenovacion('renovacion-guardada')
    const { solicitar } = await import('../api/cliente')
    let renovaciones = 0
    const llamadas = simularApi({
      // La primera renovación recupera la sesión al cargar; la segunda ocurre por el 401
      'POST /api/auth/refresh': () => json(tokens(++renovaciones === 1 ? 'inicial' : 'nuevo')),
      'GET /api/usuarios/yo': () => json(PERFIL_CIUDADANA),
      // Solo el token nuevo es válido: el inicial "venció"
      'GET /api/tramites': (llamada) =>
        llamada.cabeceras.Authorization === 'Bearer acceso-nuevo'
          ? json({ content: [] })
          : problema(401, 'Token vencido'),
    })
    renderizarApp('/panel')
    await screen.findByRole('heading', { name: 'Hola, Ana López' })

    await expect(solicitar('/api/tramites')).resolves.toEqual({ content: [] })

    expect(renovaciones).toBe(2)
    const consultas = llamadas.filter((l) => l.ruta === '/api/tramites')
    expect(consultas.map((c) => c.cabeceras.Authorization)).toEqual([
      'Bearer acceso-inicial',
      'Bearer acceso-nuevo',
    ])
  })

  it('varias llamadas que vencen a la vez provocan una sola renovación', async () => {
    guardarRenovacion('renovacion-guardada')
    const { solicitar } = await import('../api/cliente')
    let renovaciones = 0
    simularApi({
      'POST /api/auth/refresh': () => json(tokens(++renovaciones === 1 ? 'inicial' : 'nuevo')),
      'GET /api/usuarios/yo': () => json(PERFIL_CIUDADANA),
      'GET /api/tramites': (l) =>
        l.cabeceras.Authorization === 'Bearer acceso-nuevo'
          ? json({ ok: 1 })
          : problema(401, 'vencido'),
      'GET /api/pagos': (l) =>
        l.cabeceras.Authorization === 'Bearer acceso-nuevo'
          ? json({ ok: 2 })
          : problema(401, 'vencido'),
    })
    renderizarApp('/panel')
    await screen.findByRole('heading', { name: 'Hola, Ana López' })

    const resultados = await Promise.all([solicitar('/api/tramites'), solicitar('/api/pagos')])

    expect(resultados).toEqual([{ ok: 1 }, { ok: 2 }])
    // Una renovación al cargar + UNA por el vencimiento, no dos: reusar el token revocaría todas las sesiones
    expect(renovaciones).toBe(2)
  })

  it('si la renovación falla a mitad de camino, vuelve al inicio de sesión', async () => {
    guardarRenovacion('renovacion-guardada')
    const { solicitar } = await import('../api/cliente')
    let renovaciones = 0
    simularApi({
      'POST /api/auth/refresh': () =>
        ++renovaciones === 1 ? json(tokens('1')) : problema(401, 'Token de renovacion invalido'),
      'GET /api/usuarios/yo': () => json(PERFIL_CIUDADANA),
      'GET /api/tramites': () => problema(401, 'Token vencido'),
    })
    renderizarApp('/panel')
    await screen.findByRole('heading', { name: 'Hola, Ana López' })

    await solicitar('/api/tramites').catch(() => undefined)

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(leerRenovacion()).toBeNull()
  })
})

describe('cerrar sesión', () => {
  async function entrarComoAna() {
    guardarRenovacion('renovacion-guardada')
    const llamadas = simularApi({
      'POST /api/auth/refresh': () => json(tokens('1')),
      'GET /api/usuarios/yo': () => json(PERFIL_CIUDADANA),
      'POST /api/auth/logout': () => new Response(null, { status: 204 }),
    })
    renderizarApp('/panel')
    await screen.findByRole('heading', { name: 'Hola, Ana López' })
    return llamadas
  }

  it('sin token de renovación guardado NO llama al servidor: sin token la API cerraría las sesiones de todos los dispositivos', async () => {
    const llamadas = await entrarComoAna()
    sessionStorage.clear()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(llamadas.some((l) => l.ruta === '/api/auth/logout')).toBe(false)
    expect(leerToken()).toBeNull()
  })

  it('si el token de acceso ya venció, renueva primero para revocar el token de renovación vigente', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const llamadas = await entrarComoAna()
      // Pasan 20 minutos: el token de acceso (15 min) ya venció
      vi.setSystemTime(Date.now() + 20 * 60 * 1000)

      await userEvent
        .setup({ advanceTimers: () => undefined })
        .click(screen.getByRole('button', { name: 'Cerrar sesión' }))

      await waitFor(() => expect(llamadas.some((l) => l.ruta === '/api/auth/logout')).toBe(true))
      const rutas = llamadas.map((l) => l.ruta)
      // refresh (al cargar), refresh (antes de cerrar), logout
      expect(rutas.filter((r) => r === '/api/auth/refresh')).toHaveLength(2)
      expect(rutas.lastIndexOf('/api/auth/refresh')).toBeLessThan(rutas.indexOf('/api/auth/logout'))
    } finally {
      vi.useRealTimers()
    }
  })

  it('revoca en el servidor el token de renovación de esta sesión y limpia todo', async () => {
    const llamadas = await entrarComoAna()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    await waitFor(() => expect(leerToken()).toBeNull())
    const cierre = llamadas.find((l) => l.ruta === '/api/auth/logout')
    expect(cierre?.cuerpo).toEqual({ refreshToken: 'renovacion-1' })
    expect(cierre?.cabeceras.Authorization).toBe('Bearer acceso-1')
    expect(leerRenovacion()).toBeNull()
  })

  it('aunque el servidor no responda, la sesión se cierra en este navegador', async () => {
    await entrarComoAna()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await userEvent.setup().click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    await waitFor(() => expect(leerToken()).toBeNull())
    expect(leerRenovacion()).toBeNull()
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
  })
})

describe('RutaProtegida con permiso', () => {
  function ruta() {
    return (
      <MemoryRouter initialEntries={['/bitacora']}>
        <ProveedorSesion>
          <Routes>
            <Route element={<RutaProtegida permiso="bitacora:leer" />}>
              <Route path="/bitacora" element={<p>Contenido de bitácora</p>} />
            </Route>
            <Route path="/ingresar" element={<p>Pantalla de ingreso</p>} />
          </Routes>
        </ProveedorSesion>
      </MemoryRouter>
    )
  }

  it('sin el permiso muestra "sin permiso" y no el contenido', async () => {
    guardarRenovacion('renovacion-guardada')
    simularApi({
      'POST /api/auth/refresh': () => json(tokens('1')),
      'GET /api/usuarios/yo': () => json(PERFIL_CIUDADANA),
    })

    render(ruta())

    expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument()
    expect(screen.queryByText('Contenido de bitácora')).not.toBeInTheDocument()
  })

  it('con el permiso muestra el contenido', async () => {
    guardarRenovacion('renovacion-guardada')
    simularApi({
      'POST /api/auth/refresh': () => json(tokens('1')),
      'GET /api/usuarios/yo': () =>
        json({
          ...PERFIL_CIUDADANA,
          roles: ['AUDITOR'],
          permisos: ['bitacora:leer'],
          alcanceTotal: true,
        }),
    })

    render(ruta())

    expect(await screen.findByText('Contenido de bitácora')).toBeInTheDocument()
  })

  it('sin sesión lleva a la pantalla de ingreso', async () => {
    simularApi({})

    render(ruta())

    expect(await screen.findByText('Pantalla de ingreso')).toBeInTheDocument()
  })
})
