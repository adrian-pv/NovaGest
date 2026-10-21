import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ErrorApi } from '../api/errores'
import type { DatosDePagina, Pagina } from '../api/tipos'
import Aviso from './Aviso'
import AvisoError from './AvisoError'
import Boton from './Boton'
import Campo from './Campo'
import LimiteDeError from './LimiteDeError'
import TablaPaginada, { type Columna } from './TablaPaginada'

describe('Campo', () => {
  it('asocia la etiqueta con el campo', () => {
    render(<Campo etiqueta="Correo" />)

    expect(screen.getByLabelText('Correo')).toBeInTheDocument()
  })

  it('con error marca el campo como inválido y enlaza el motivo para los lectores de pantalla', () => {
    render(<Campo etiqueta="Correo" error="Formato inválido" ayuda="Usa tu correo personal" />)

    const campo = screen.getByLabelText('Correo')
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(campo).toHaveAccessibleDescription('Usa tu correo personal Formato inválido')
  })

  it('sin error no lo marca como inválido', () => {
    render(<Campo etiqueta="Correo" />)

    expect(screen.getByLabelText('Correo')).toHaveAttribute('aria-invalid', 'false')
  })

  it('varios campos no comparten identificador', () => {
    render(
      <>
        <Campo etiqueta="Uno" />
        <Campo etiqueta="Dos" />
      </>,
    )

    expect(screen.getByLabelText('Uno').id).not.toBe(screen.getByLabelText('Dos').id)
  })
})

describe('Aviso', () => {
  it('los errores se anuncian como alerta y el resto como estado', () => {
    render(
      <>
        <Aviso tipo="error">Falló</Aviso>
        <Aviso tipo="exito">Listo</Aviso>
      </>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Falló')
    expect(screen.getByRole('status')).toHaveTextContent('Listo')
  })
})

describe('AvisoError', () => {
  it('con un ErrorApi muestra su título, su mensaje y los campos inválidos', () => {
    const error = new ErrorApi(400, 'La solicitud tiene campos inválidos', [
      { campo: 'correo', motivo: 'Formato inválido' },
    ])

    render(<AvisoError error={error} />)

    const alerta = screen.getByRole('alert')
    expect(alerta).toHaveTextContent('Revisa los datos')
    expect(alerta).toHaveTextContent('La solicitud tiene campos inválidos')
    expect(alerta).toHaveTextContent('correo: Formato inválido')
  })

  it('puede ocultar los campos si la pantalla ya los muestra junto a cada uno', () => {
    const error = new ErrorApi(400, 'Inválido', [{ campo: 'correo', motivo: 'Formato inválido' }])

    render(<AvisoError error={error} mostrarCampos={false} />)

    expect(screen.queryByText(/Formato inválido/)).not.toBeInTheDocument()
  })

  it('permite cambiar el título', () => {
    render(
      <AvisoError
        error={new ErrorApi(401, 'Credenciales invalidas')}
        titulo="No se pudo iniciar sesión"
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo iniciar sesión')
  })

  it('con un error que no es de la API usa un texto general y nunca el mensaje original', () => {
    render(<AvisoError error={new Error('TypeError: x is undefined en línea 42')} />)

    const alerta = screen.getByRole('alert')
    expect(alerta).toHaveTextContent('error inesperado')
    expect(alerta).not.toHaveTextContent('línea 42')
  })
})

describe('Boton', () => {
  it('por defecto no envía formularios', () => {
    render(<Boton>Aceptar</Boton>)

    expect(screen.getByRole('button', { name: 'Aceptar' })).toHaveAttribute('type', 'button')
  })

  it('mientras carga se desactiva y cambia el texto, para evitar envíos dobles', async () => {
    const alPulsar = vi.fn()
    render(
      <Boton cargando textoCargando="Guardando..." onClick={alPulsar}>
        Guardar
      </Boton>,
    )

    const boton = screen.getByRole('button', { name: 'Guardando...' })
    expect(boton).toBeDisabled()
    await userEvent.setup().click(boton)
    expect(alPulsar).not.toHaveBeenCalled()
  })
})

describe('LimiteDeError', () => {
  function Rompe(): never {
    throw new Error('detalle técnico secreto')
  }

  it('muestra una página amable y no el detalle técnico cuando una pantalla falla', () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(
      <LimiteDeError>
        <Rompe />
      </LimiteDeError>,
    )
    consola.mockRestore()

    expect(screen.getByRole('alert')).toHaveTextContent('Algo salió mal')
    expect(screen.queryByText(/detalle técnico secreto/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recargar la página' })).toBeInTheDocument()
  })

  it('si nada falla muestra el contenido', () => {
    render(
      <LimiteDeError>
        <p>Todo bien</p>
      </LimiteDeError>,
    )

    expect(screen.getByText('Todo bien')).toBeInTheDocument()
  })
})

describe('TablaPaginada', () => {
  interface Fila {
    id: number
    nombre: string
    monto: number
  }

  const columnas: Columna<Fila>[] = [
    { clave: 'nombre', encabezado: 'Nombre', celda: (f) => f.nombre },
    { clave: 'monto', encabezado: 'Monto', celda: (f) => `Q${f.monto}`, derecha: true },
  ]

  /** Forma real de la API: los elementos en `content` y la paginación anidada en `page` (verificado en vivo). */
  function pagina(
    datos: Partial<DatosDePagina> = {},
    content: Fila[] = [
      { id: 1, nombre: 'Boleto de ornato', monto: 25 },
      { id: 2, nombre: 'Pago de IGSS', monto: 80 },
    ],
  ): Pagina<Fila> {
    return { content, page: { totalElements: 45, totalPages: 3, number: 1, size: 20, ...datos } }
  }

  function dibujar(props: Partial<React.ComponentProps<typeof TablaPaginada<Fila>>> = {}) {
    const alCambiar = vi.fn()
    render(
      <TablaPaginada<Fila>
        titulo="Trámites"
        columnas={columnas}
        pagina={pagina()}
        onCambiarPagina={alCambiar}
        idFila={(f) => f.id}
        {...props}
      />,
    )
    return alCambiar
  }

  it('muestra encabezados, filas y el resumen de la página', () => {
    dibujar()

    expect(screen.getByRole('table', { name: 'Trámites' })).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader').map((c) => c.textContent)).toEqual([
      'Nombre',
      'Monto',
    ])
    const filas = screen.getAllByRole('row')
    expect(filas).toHaveLength(3)
    expect(within(filas[1]).getByText('Boleto de ornato')).toBeInTheDocument()
    expect(within(filas[2]).getByText('Q80')).toBeInTheDocument()
    expect(screen.getByText('Mostrando 21–22 de 45')).toBeInTheDocument()
    expect(screen.getByText('Página 2 de 3')).toBeInTheDocument()
  })

  it('pide la página anterior y la siguiente con la numeración de la API (desde 0)', async () => {
    const alCambiar = dibujar()
    const usuario = userEvent.setup()

    await usuario.click(screen.getByRole('button', { name: 'Anterior' }))
    await usuario.click(screen.getByRole('button', { name: 'Siguiente' }))

    expect(alCambiar).toHaveBeenNthCalledWith(1, 0)
    expect(alCambiar).toHaveBeenNthCalledWith(2, 2)
  })

  it('en la primera página no se puede retroceder y en la última no se puede avanzar', () => {
    dibujar({ pagina: pagina({ number: 0 }) })
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled()
  })

  it('en la última página no se puede avanzar', () => {
    dibujar({ pagina: pagina({ number: 2 }) })
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeEnabled()
  })

  it('mientras recarga una página desactiva la navegación', () => {
    dibujar({ cargando: true })
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
  })

  it('sin datos todavía muestra que está cargando', () => {
    dibujar({ pagina: undefined })
    expect(screen.getByRole('status')).toHaveTextContent('Cargando datos...')
  })

  it('con una página vacía muestra el mensaje de vacío', () => {
    dibujar({
      pagina: pagina({ totalElements: 0, totalPages: 0, number: 0 }, []),
      mensajeVacio: 'Aún no tienes trámites.',
    })
    expect(screen.getByText('Aún no tienes trámites.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('ante un error muestra el aviso y permite reintentar', async () => {
    const reintentar = vi.fn()
    dibujar({ error: new ErrorApi(500, 'x'), onReintentar: reintentar })

    expect(screen.getByRole('alert')).toHaveTextContent('Error del servidor')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(reintentar).toHaveBeenCalledTimes(1)
  })
})
