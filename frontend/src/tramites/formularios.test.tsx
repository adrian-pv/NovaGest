import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { json, PERFIL_CIUDADANA, problema } from '../test/api-simulada'
import {
  accion,
  HISTORIAL,
  pagina,
  TIPO_IGSS,
  TIPO_INACTIVO,
  TIPO_ORNATO,
  tramite,
  GESTOR,
} from '../test/datos'
import { limpiarSesion, renderizarApp, simularSesion } from '../test/utilidades'

const CIUDADANO = {
  ...PERFIL_CIUDADANA,
  permisos: ['tramite:leer', 'tramite:crear', 'tramite:editar', 'tipo_tramite:leer'],
}

/** Lo que pide la pantalla de detalle, a la que se llega tras guardar. */
function rutasDetalle(t = tramite()) {
  return {
    'GET /api/tramites/12': () => json(t),
    'GET /api/tipos-tramite/1': () => json(TIPO_ORNATO),
    'GET /api/tramites/12/historial': () => json(HISTORIAL),
    'GET /api/tramites/12/transiciones': () => json([accion()]),
  }
}

const TIPOS = {
  'GET /api/tipos-tramite': () => json(pagina([TIPO_ORNATO, TIPO_IGSS, TIPO_INACTIVO])),
}

beforeEach(() => limpiarSesion())
afterEach(() => vi.unstubAllGlobals())

describe('nuevo trámite', () => {
  async function abrir(extra = {}) {
    const llamadas = simularSesion(CIUDADANO, { ...TIPOS, ...rutasDetalle(), ...extra })
    renderizarApp('/tramites/nuevo')
    await screen.findByLabelText('Tipo de trámite')
    return llamadas
  }

  it('ofrece solo los tipos activos', async () => {
    await abrir()

    const opciones = screen.getAllByRole('option').map((o) => o.textContent)
    expect(opciones).toEqual(['Elige un tipo', 'Boleto de ornato', 'Pago de IGSS'])
  })

  it('al elegir un tipo arma el formulario con sus campos, en orden, con su ayuda y su costo', async () => {
    await abrir()

    await userEvent.setup().selectOptions(screen.getByLabelText('Tipo de trámite'), '1')

    expect(screen.getByText('Pago del boleto de ornato')).toBeInTheDocument()
    expect(screen.getByText(/Costo: Q\s?25\.00/)).toBeInTheDocument()
    const etiquetas = screen.getAllByRole('textbox').map((c) => c.getAttribute('id'))
    expect(etiquetas.length).toBeGreaterThan(0)
    expect(screen.getByLabelText('DPI de 13 dígitos')).toHaveAccessibleDescription(
      'Obligatorio para enviar el trámite.',
    )
    expect(screen.getByLabelText('Ingreso mensual')).toHaveAccessibleDescription(
      'Obligatorio para enviar el trámite. Mínimo 0.',
    )
    expect(screen.getByLabelText('Fecha de nacimiento')).toHaveAttribute('type', 'date')
    expect(screen.getByLabelText('Está casado')).toHaveAttribute('type', 'checkbox')
  })

  it('un tipo sin descripción ni costo no muestra el recuadro informativo', async () => {
    await abrir()

    await userEvent.setup().selectOptions(screen.getByLabelText('Tipo de trámite'), '2')

    expect(screen.queryByText(/Costo:/)).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('guarda un borrador incompleto: omite los campos vacíos, manda la casilla y va al detalle con un aviso', async () => {
    const llamadas = await abrir({ 'POST /api/tramites': () => json(tramite(), 201) })
    const usuario = userEvent.setup()

    await usuario.selectOptions(screen.getByLabelText('Tipo de trámite'), '1')
    await usuario.type(screen.getByLabelText('DPI de 13 dígitos'), '1234567890123')
    await usuario.click(screen.getByRole('button', { name: 'Guardar borrador' }))

    expect(await screen.findByRole('heading', { name: /Trámite #12/ })).toBeInTheDocument()
    expect(screen.getByText(/Guardamos tu trámite como borrador/)).toBeInTheDocument()
    const envio = llamadas.find((l) => l.metodo === 'POST' && l.ruta === '/api/tramites')
    expect(envio?.cuerpo).toEqual({ tipoId: 1, datos: { dpi: '1234567890123', casado: false } })
  })

  it('convierte el ingreso escrito con coma y manda las casillas marcadas y las fechas', async () => {
    const llamadas = await abrir({ 'POST /api/tramites': () => json(tramite(), 201) })
    const usuario = userEvent.setup()

    await usuario.selectOptions(screen.getByLabelText('Tipo de trámite'), '1')
    await usuario.type(screen.getByLabelText('Ingreso mensual'), '3500,5')
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), {
      target: { value: '1990-03-05' },
    })
    await usuario.click(screen.getByLabelText('Está casado'))
    await usuario.click(screen.getByRole('button', { name: 'Guardar borrador' }))

    await screen.findByRole('heading', { name: /Trámite #12/ })
    const envio = llamadas.find((l) => l.metodo === 'POST' && l.ruta === '/api/tramites')
    expect(envio?.cuerpo).toEqual({
      tipoId: 1,
      datos: { ingreso: 3500.5, nacimiento: '1990-03-05', casado: true },
    })
  })

  it('un número mal escrito se avisa junto al campo y no se manda nada', async () => {
    const llamadas = await abrir()
    const usuario = userEvent.setup()

    await usuario.selectOptions(screen.getByLabelText('Tipo de trámite'), '1')
    await usuario.type(screen.getByLabelText('Ingreso mensual'), 'mucho')
    await usuario.click(screen.getByRole('button', { name: 'Guardar borrador' }))

    expect(await screen.findByText(/Escribe un número/)).toBeInTheDocument()
    expect(screen.getByLabelText('Ingreso mensual')).toHaveAttribute('aria-invalid', 'true')
    expect(llamadas.some((l) => l.metodo === 'POST' && l.ruta === '/api/tramites')).toBe(false)
  })

  it('muestra junto a cada campo lo que la API rechazó, sin repetirlo en un aviso general', async () => {
    await abrir({
      'POST /api/tramites': () =>
        problema(400, 'La solicitud tiene campos invalidos', [
          { campo: 'datos.dpi', motivo: 'No cumple el formato esperado' },
        ]),
    })
    const usuario = userEvent.setup()

    await usuario.selectOptions(screen.getByLabelText('Tipo de trámite'), '1')
    await usuario.type(screen.getByLabelText('DPI de 13 dígitos'), '123')
    await usuario.click(screen.getByRole('button', { name: 'Guardar borrador' }))

    expect(await screen.findByText('No cumple el formato esperado')).toBeInTheDocument()
    expect(screen.getByLabelText('DPI de 13 dígitos')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('un error que no es de un campo sí se muestra como aviso', async () => {
    await abrir({ 'POST /api/tramites': () => problema(409, 'El tipo de tramite no esta activo') })
    const usuario = userEvent.setup()

    await usuario.selectOptions(screen.getByLabelText('Tipo de trámite'), '1')
    await usuario.click(screen.getByRole('button', { name: 'Guardar borrador' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('El tipo de tramite no esta activo')
  })

  it('no se puede guardar sin elegir un tipo', async () => {
    await abrir()

    expect(screen.getByRole('button', { name: 'Guardar borrador' })).toBeDisabled()
  })

  it('si no hay tipos disponibles lo explica', async () => {
    simularSesion(CIUDADANO, { 'GET /api/tipos-tramite': () => json(pagina([TIPO_INACTIVO])) })

    renderizarApp('/tramites/nuevo')

    expect(await screen.findByText(/No hay tipos de trámite disponibles/)).toBeInTheDocument()
  })

  it('si falla la carga de tipos permite reintentar', async () => {
    let intentos = 0
    simularSesion(CIUDADANO, {
      'GET /api/tipos-tramite': () =>
        ++intentos === 1 ? problema(500, 'x') : json(pagina([TIPO_ORNATO])),
    })
    renderizarApp('/tramites/nuevo')

    expect(await screen.findByRole('alert')).toHaveTextContent('Error del servidor')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByLabelText('Tipo de trámite')).toBeInTheDocument()
  })

  it('quien no puede crear trámites ve "sin permiso"', async () => {
    simularSesion(GESTOR)

    renderizarApp('/tramites/nuevo')

    expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument()
  })
})

describe('editar trámite', () => {
  it('parte de lo guardado: texto, número, fecha y casilla', async () => {
    simularSesion(CIUDADANO, rutasDetalle())

    renderizarApp('/tramites/12/editar')

    expect(await screen.findByLabelText('DPI de 13 dígitos')).toHaveValue('1234567890123')
    expect(screen.getByLabelText('Ingreso mensual')).toHaveValue('3500.5')
    expect(screen.getByLabelText('Fecha de nacimiento')).toHaveValue('1990-03-05')
    expect(screen.getByLabelText('Está casado')).toBeChecked()
  })

  it('al guardar reemplaza los datos (un campo vaciado se omite) y vuelve al detalle con un aviso', async () => {
    const llamadas = simularSesion(CIUDADANO, {
      ...rutasDetalle(),
      'PUT /api/tramites/12': () => json(tramite()),
    })
    const usuario = userEvent.setup()
    renderizarApp('/tramites/12/editar')
    await screen.findByLabelText('DPI de 13 dígitos')

    await usuario.clear(screen.getByLabelText('Ingreso mensual'))
    await usuario.clear(screen.getByLabelText('DPI de 13 dígitos'))
    await usuario.type(screen.getByLabelText('DPI de 13 dígitos'), '9999999999999')
    await usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Guardamos los cambios.')).toBeInTheDocument()
    const cambio = llamadas.find((l) => l.metodo === 'PUT')
    expect(cambio?.cuerpo).toEqual({
      datos: { dpi: '9999999999999', nacimiento: '1990-03-05', casado: true },
    })
  })

  it('un trámite observado muestra qué debe corregirse', async () => {
    simularSesion(
      CIUDADANO,
      rutasDetalle(tramite({ estado: 'OBSERVADO', motivo: 'Falta la dirección' })),
    )

    renderizarApp('/tramites/12/editar')

    const aviso = await screen.findByText('Qué debes corregir')
    expect(aviso.closest('[role="status"]')).toHaveTextContent('Falta la dirección')
  })

  it('una persona ciudadana no puede editar un trámite ya enviado', async () => {
    simularSesion(CIUDADANO, rutasDetalle(tramite({ estado: 'ENVIADO' })))

    renderizarApp('/tramites/12/editar')

    expect(await screen.findByText(/ya no admite cambios/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
  })

  it('el personal con alcance total sí puede editar uno enviado, pero no uno final', async () => {
    simularSesion(GESTOR, rutasDetalle(tramite({ estado: 'ENVIADO' })))
    const { unmount } = renderizarApp('/tramites/12/editar')
    expect(await screen.findByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
    unmount()
    limpiarSesion()

    simularSesion(GESTOR, rutasDetalle(tramite({ estado: 'FINALIZADO' })))
    renderizarApp('/tramites/12/editar')
    expect(await screen.findByText(/ya no admite cambios/)).toBeInTheDocument()
  })

  it('un trámite ajeno o inexistente responde "no encontrado" con un enlace para volver', async () => {
    simularSesion(CIUDADANO, {
      'GET /api/tramites/12': () => problema(404, 'El tramite no existe'),
    })

    renderizarApp('/tramites/12/editar')

    expect(await screen.findByRole('alert')).toHaveTextContent('No encontrado')
    expect(screen.getByRole('link', { name: 'Volver a los trámites' })).toBeInTheDocument()
  })

  it.each(['abc', '0', '-3', '1.5', '99999999999999999'])(
    'la dirección /tramites/%s/editar no es un trámite válido',
    async (id) => {
      simularSesion(CIUDADANO)

      renderizarApp(`/tramites/${id}/editar`)

      expect(
        await screen.findByRole('heading', { name: 'Página no encontrada' }),
      ).toBeInTheDocument()
    },
  )
})
