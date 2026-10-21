import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Historial, Tramite, TransicionDisponible } from '../api/tramites'
import { json, PERFIL_CIUDADANA, problema } from '../test/api-simulada'
import { accion, GESTOR, HISTORIAL, TIPO_ORNATO, tramite } from '../test/datos'
import { limpiarSesion, renderizarApp, simularSesion } from '../test/utilidades'

const CIUDADANO = {
  ...PERFIL_CIUDADANA,
  permisos: ['tramite:leer', 'tramite:crear', 'tramite:editar', 'tipo_tramite:leer'],
}

interface Escenario {
  tramite?: Tramite
  acciones?: TransicionDisponible[]
  historial?: Historial[]
}

function rutas({
  tramite: t = tramite(),
  acciones = [accion()],
  historial = HISTORIAL,
}: Escenario = {}) {
  return {
    'GET /api/tramites/12': () => json(t),
    'GET /api/tipos-tramite/1': () => json(TIPO_ORNATO),
    'GET /api/tramites/12/historial': () => json(historial),
    'GET /api/tramites/12/transiciones': () => json(acciones),
  }
}

beforeEach(() => limpiarSesion())
afterEach(() => vi.unstubAllGlobals())

describe('detalle de un trámite: datos', () => {
  it('muestra los datos con las etiquetas del tipo y con formato legible', async () => {
    simularSesion(CIUDADANO, rutas())

    renderizarApp('/tramites/12')

    expect(await screen.findByRole('heading', { name: /Trámite #12/ })).toBeInTheDocument()
    const datos = within(screen.getByRole('region', { name: 'Datos del trámite' }))
    expect(datos.getByText('DPI de 13 dígitos')).toBeInTheDocument()
    expect(datos.getByText('1234567890123')).toBeInTheDocument()
    expect(datos.getByText(/3[,.\s]?500[.,]5/)).toBeInTheDocument()
    expect(datos.getByText(/1990/)).toBeInTheDocument()
    expect(datos.getByText('Sí')).toBeInTheDocument()
  })

  it('un campo sin valor se muestra como una raya y una casilla en falso como "No"', async () => {
    simularSesion(
      CIUDADANO,
      rutas({ tramite: tramite({ datos: { dpi: '1234567890123', casado: false } }) }),
    )

    renderizarApp('/tramites/12')

    const datos = within(await screen.findByRole('region', { name: 'Datos del trámite' }))
    expect(datos.getAllByText('—')).toHaveLength(2)
    expect(datos.getByText('No')).toBeInTheDocument()
  })

  it('muestra el estado con su color y el tipo de trámite', async () => {
    simularSesion(CIUDADANO, rutas({ tramite: tramite({ estado: 'FINALIZADO' }) }))

    renderizarApp('/tramites/12')

    const titulo = await screen.findByRole('heading', { name: /Trámite #12/ })
    expect(within(titulo).getByText('Finalizado')).toHaveClass('insignia--exito')
    expect(screen.getByText(/Boleto de ornato · creado el/)).toBeInTheDocument()
  })

  it.each([
    ['OBSERVADO', 'Qué debe corregirse', 'advertencia'],
    ['RECHAZADO', 'Motivo del rechazo', 'error'],
  ] as const)(
    'en estado %s muestra el motivo bajo el título "%s"',
    async (estado, titulo, tipo) => {
      simularSesion(
        CIUDADANO,
        rutas({ tramite: tramite({ estado, motivo: 'Falta la dirección' }) }),
      )

      renderizarApp('/tramites/12')

      const aviso = (await screen.findByText(titulo)).closest('.aviso')
      expect(aviso).toHaveClass(`aviso--${tipo}`)
      expect(aviso).toHaveTextContent('Falta la dirección')
    },
  )

  it('un borrador no muestra ningún motivo', async () => {
    simularSesion(CIUDADANO, rutas({ tramite: tramite({ estado: 'BORRADOR', motivo: 'viejo' }) }))

    renderizarApp('/tramites/12')

    await screen.findByRole('heading', { name: /Trámite #12/ })
    expect(screen.queryByText('viejo')).not.toBeInTheDocument()
  })

  it('un trámite ajeno o inexistente muestra "no encontrado" con enlace para volver', async () => {
    simularSesion(CIUDADANO, {
      'GET /api/tramites/12': () => problema(404, 'El tramite no existe'),
    })

    renderizarApp('/tramites/12')

    expect(await screen.findByRole('alert')).toHaveTextContent('No encontrado')
    expect(screen.getByRole('link', { name: 'Volver a los trámites' })).toBeInTheDocument()
  })

  it('una dirección que no es un número de trámite lleva a "página no encontrada" sin llamar a la API', async () => {
    const llamadas = simularSesion(CIUDADANO)

    renderizarApp('/tramites/abc')

    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
    expect(llamadas.some((l) => l.ruta.startsWith('/api/tramites/'))).toBe(false)
  })
})

describe('detalle de un trámite: botón de editar', () => {
  it.each([
    ['la persona ciudadana con un borrador', CIUDADANO, 'BORRADOR', true],
    ['la persona ciudadana con un trámite observado', CIUDADANO, 'OBSERVADO', true],
    ['la persona ciudadana con un trámite ya enviado', CIUDADANO, 'ENVIADO', false],
    ['el personal con un trámite enviado', GESTOR, 'ENVIADO', true],
    ['el personal con un trámite finalizado', GESTOR, 'FINALIZADO', false],
    ['el personal con un trámite rechazado', GESTOR, 'RECHAZADO', false],
    [
      'quien no tiene permiso de editar',
      { ...CIUDADANO, permisos: ['tramite:leer', 'tipo_tramite:leer'] },
      'BORRADOR',
      false,
    ],
  ])('%s', async (_quien, perfil, estado, debeVerse) => {
    simularSesion(perfil, rutas({ tramite: tramite({ estado: estado as Tramite['estado'] }) }))

    renderizarApp('/tramites/12')

    await screen.findByRole('heading', { name: /Trámite #12/ })
    const enlace = screen.queryByRole('link', { name: 'Editar datos' })
    if (debeVerse) expect(enlace).toHaveAttribute('href', '/tramites/12/editar')
    else expect(enlace).not.toBeInTheDocument()
  })
})

describe('detalle de un trámite: acciones', () => {
  it('ofrece solo las acciones que la API dice que se pueden hacer, con su texto', async () => {
    simularSesion(
      GESTOR,
      rutas({
        tramite: tramite({ estado: 'EN_REVISION' }),
        acciones: [
          accion({ accion: 'OBSERVAR', estadoDestino: 'OBSERVADO', comentarioObligatorio: true }),
          accion({ accion: 'APROBAR_REVISION', estadoDestino: 'POR_PAGAR' }),
          accion({ accion: 'RECHAZAR', estadoDestino: 'RECHAZADO', comentarioObligatorio: true }),
        ],
      }),
    )

    renderizarApp('/tramites/12')

    const acciones = within(await screen.findByRole('region', { name: 'Qué puedes hacer ahora' }))
    expect(await acciones.findByRole('button', { name: 'Observar' })).toBeEnabled()
    expect(acciones.getByRole('button', { name: 'Aprobar y pasar a pago' })).toBeEnabled()
    expect(acciones.getByRole('button', { name: 'Rechazar' })).toHaveClass('boton--peligro')
    expect(acciones.queryByRole('button', { name: 'Finalizar trámite' })).not.toBeInTheDocument()
  })

  it('una acción que todavía no se puede hacer aparece desactivada con su motivo', async () => {
    simularSesion(
      CIUDADANO,
      rutas({
        acciones: [accion({ ejecutable: false, motivo: 'Faltan campos obligatorios del tramite' })],
      }),
    )

    renderizarApp('/tramites/12')

    expect(await screen.findByRole('button', { name: 'Enviar trámite' })).toBeDisabled()
    expect(screen.getByText('Faltan campos obligatorios del tramite')).toBeInTheDocument()
  })

  it('sin acciones disponibles lo dice', async () => {
    simularSesion(CIUDADANO, rutas({ acciones: [] }))

    renderizarApp('/tramites/12')

    expect(await screen.findByText(/No hay acciones disponibles para ti/)).toBeInTheDocument()
  })

  it('una acción sin comentario se ejecuta de inmediato, avisa el resultado y recarga el trámite', async () => {
    let enviado = false
    const llamadas = simularSesion(CIUDADANO, {
      ...rutas(),
      'GET /api/tramites/12': () => json(tramite({ estado: enviado ? 'ENVIADO' : 'BORRADOR' })),
      'GET /api/tramites/12/transiciones': () => json(enviado ? [] : [accion()]),
      'POST /api/tramites/12/transiciones': () => {
        enviado = true
        return json(tramite({ estado: 'ENVIADO' }))
      },
    })
    renderizarApp('/tramites/12')

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Enviar trámite' }))

    expect(
      await screen.findByText(/fue enviado y quedó a la espera de revisión/),
    ).toBeInTheDocument()
    const envio = llamadas.find((l) => l.metodo === 'POST' && l.ruta.endsWith('/transiciones'))
    expect(envio?.cuerpo).toEqual({ estadoDestino: 'ENVIADO' })
    expect(await screen.findByText(/No hay acciones disponibles/)).toBeInTheDocument()
    const titulo = screen.getByRole('heading', { name: /Trámite #12/ })
    expect(within(titulo).getByText('Enviado')).toBeInTheDocument()
  })

  describe('con comentario obligatorio', () => {
    const observar = accion({
      accion: 'OBSERVAR',
      estadoDestino: 'OBSERVADO',
      comentarioObligatorio: true,
    })

    it('pide el comentario, no deja confirmar sin él y lo manda en la acción', async () => {
      const llamadas = simularSesion(GESTOR, {
        ...rutas({ tramite: tramite({ estado: 'EN_REVISION' }), acciones: [observar] }),
        'POST /api/tramites/12/transiciones': () => json(tramite({ estado: 'OBSERVADO' })),
      })
      const usuario = userEvent.setup()
      renderizarApp('/tramites/12')

      await usuario.click(await screen.findByRole('button', { name: 'Observar' }))
      const confirmar = screen.getByRole('button', { name: 'Confirmar' })
      expect(confirmar).toBeDisabled()
      expect(llamadas.some((l) => l.metodo === 'POST' && l.ruta.endsWith('/transiciones'))).toBe(
        false,
      )

      await usuario.type(screen.getByLabelText(/Comentario para "Observar"/), '   ')
      expect(confirmar).toBeDisabled()
      await usuario.type(
        screen.getByLabelText(/Comentario para "Observar"/),
        ' Falta la dirección ',
      )
      expect(confirmar).toBeEnabled()
      await usuario.click(confirmar)

      await vi.waitFor(() =>
        expect(llamadas.some((l) => l.metodo === 'POST' && l.ruta.endsWith('/transiciones'))).toBe(
          true,
        ),
      )
      expect(
        llamadas.find((l) => l.metodo === 'POST' && l.ruta.endsWith('/transiciones'))?.cuerpo,
      ).toEqual({
        estadoDestino: 'OBSERVADO',
        comentario: 'Falta la dirección',
      })
      expect(await screen.findByText(/quedó observado/)).toBeInTheDocument()
      expect(screen.queryByLabelText(/Comentario para/)).not.toBeInTheDocument()
    })

    it('"Cancelar" cierra el formulario sin hacer nada', async () => {
      const llamadas = simularSesion(
        GESTOR,
        rutas({ tramite: tramite({ estado: 'EN_REVISION' }), acciones: [observar] }),
      )
      const usuario = userEvent.setup()
      renderizarApp('/tramites/12')

      await usuario.click(await screen.findByRole('button', { name: 'Observar' }))
      await usuario.click(screen.getByRole('button', { name: 'Cancelar' }))

      expect(screen.queryByLabelText(/Comentario para/)).not.toBeInTheDocument()
      expect(llamadas.some((l) => l.metodo === 'POST' && l.ruta.endsWith('/transiciones'))).toBe(
        false,
      )
    })
  })

  it('si la acción falla muestra el aviso de la API y no da el trámite por cambiado', async () => {
    simularSesion(CIUDADANO, {
      ...rutas(),
      'POST /api/tramites/12/transiciones': () =>
        problema(400, 'La solicitud tiene campos invalidos', [
          { campo: 'datos.dpi', motivo: 'Campo obligatorio' },
        ]),
    })
    renderizarApp('/tramites/12')

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Enviar trámite' }))

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Revisa los datos')
    expect(alerta).toHaveTextContent('datos.dpi: Campo obligatorio')
    expect(screen.queryByText(/fue enviado/)).not.toBeInTheDocument()
  })

  it('un error del servidor al ejecutar no revela detalles internos', async () => {
    simularSesion(CIUDADANO, {
      ...rutas(),
      'POST /api/tramites/12/transiciones': () =>
        problema(500, 'org.postgresql.util.PSQLException: deadlock'),
    })
    renderizarApp('/tramites/12')

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Enviar trámite' }))

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Error del servidor')
    expect(alerta).not.toHaveTextContent('PSQL')
  })

  it('si fallan las acciones el resto del trámite sigue visible', async () => {
    simularSesion(CIUDADANO, {
      ...rutas(),
      'GET /api/tramites/12/transiciones': () => problema(403, 'No tienes permiso'),
    })

    renderizarApp('/tramites/12')

    expect(await screen.findByRole('heading', { name: /Trámite #12/ })).toBeInTheDocument()
    const acciones = within(await screen.findByRole('region', { name: 'Qué puedes hacer ahora' }))
    expect(await acciones.findByRole('alert')).toHaveTextContent('Sin permiso')
  })
})

describe('detalle de un trámite: historial', () => {
  it('lista los movimientos con quién los hizo, distinguiendo "Tú" de otras personas', async () => {
    simularSesion(CIUDADANO, rutas())

    renderizarApp('/tramites/12')

    const historial = within(await screen.findByRole('region', { name: 'Historial' }))
    const filas = await historial.findAllByRole('row')
    expect(filas).toHaveLength(4)
    expect(within(filas[1]).getByText(/Creado como/)).toBeInTheDocument()
    expect(within(filas[1]).getByText('Tú')).toBeInTheDocument()
    expect(within(filas[3]).getByText('Usuario #3')).toBeInTheDocument()
    expect(within(filas[3]).getByText('Falta la dirección')).toBeInTheDocument()
    expect(within(filas[2]).getByText('Borrador')).toBeInTheDocument()
    expect(within(filas[2]).getByText('Enviado')).toBeInTheDocument()
  })

  it('un trámite sin movimientos lo dice', async () => {
    simularSesion(CIUDADANO, rutas({ historial: [] }))

    renderizarApp('/tramites/12')

    expect(await screen.findByText('Todavía no hay movimientos.')).toBeInTheDocument()
  })

  it('si el historial falla, el resto del trámite sigue visible', async () => {
    simularSesion(CIUDADANO, {
      ...rutas(),
      'GET /api/tramites/12/historial': () => problema(500, 'x'),
    })

    renderizarApp('/tramites/12')

    expect(await screen.findByRole('heading', { name: /Trámite #12/ })).toBeInTheDocument()
    const historial = within(await screen.findByRole('region', { name: 'Historial' }))
    expect(await historial.findByRole('alert')).toHaveTextContent('Error del servidor')
  })
})
