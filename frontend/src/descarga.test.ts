import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { guardarArchivo } from './descarga'

describe('guardarArchivo', () => {
  const crear = vi.fn(() => 'blob:direccion-temporal')
  const revocar = vi.fn()
  let clics: { download: string; href: string; rel: string }[]

  beforeEach(() => {
    vi.useFakeTimers()
    clics = []
    URL.createObjectURL = crear
    URL.revokeObjectURL = revocar
    crear.mockClear()
    revocar.mockClear()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clics.push({ download: this.download, href: this.href, rel: this.rel })
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('entrega el archivo con el nombre sugerido', () => {
    guardarArchivo(new Blob(['x']), 'comprobante-5.pdf', 'respaldo')

    expect(clics).toHaveLength(1)
    expect(clics[0].download).toBe('comprobante-5.pdf')
    expect(clics[0].href).toBe('blob:direccion-temporal')
    expect(clics[0].rel).toBe('noopener')
  })

  it('sin nombre sugerido usa el de respaldo', () => {
    guardarArchivo(new Blob(['x']), null, 'comprobante-9')

    expect(clics[0].download).toBe('comprobante-9')
  })

  it('libera la dirección temporal poco después y no deja el enlace en la página', () => {
    guardarArchivo(new Blob(['x']), 'a.pdf', 'respaldo')
    expect(revocar).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1000)

    expect(revocar).toHaveBeenCalledWith('blob:direccion-temporal')
    expect(document.querySelector('a[download]')).toBeNull()
  })
})
