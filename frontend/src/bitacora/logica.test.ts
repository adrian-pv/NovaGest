import { describe, expect, it } from 'vitest'
import { aplanar, valorLegible } from './detalle'
import {
  OPCIONES_ACCION,
  OPCIONES_RECURSO,
  conValorActual,
  etiquetaDeAccion,
  etiquetaDeRecurso,
} from './etiquetas'
import {
  SIN_FILTROS,
  aConsulta,
  aParametros,
  desdeParametros,
  hayFiltros,
  validar,
  type FiltrosEscritos,
} from './filtros'

function filtros(extra: Partial<FiltrosEscritos> = {}): FiltrosEscritos {
  return { ...SIN_FILTROS, ...extra }
}

describe('filtros en la dirección', () => {
  it('lee solo los filtros conocidos y deja vacío lo que falta, sin espacios', () => {
    const lectura = desdeParametros(
      new URLSearchParams('recurso=pago&accion=%20VALIDACION_PAGO%20&actorId=3&page=2&otro=x'),
    )

    expect(lectura).toEqual({
      recurso: 'pago',
      accion: 'VALIDACION_PAGO',
      actorId: '3',
      recursoId: '',
      desde: '',
      hasta: '',
    })
  })

  it('escribe en la dirección solo lo que tiene valor, de modo que sin filtros queda limpia', () => {
    expect(aParametros(SIN_FILTROS).toString()).toBe('')
    expect(
      aParametros(filtros({ recurso: 'pago', desde: '2026-10-01', actorId: ' 4 ' })).toString(),
    ).toBe('recurso=pago&actorId=4&desde=2026-10-01')
  })

  it('ir y volver por la dirección no cambia nada', () => {
    const original = filtros({
      recurso: 'tramite',
      accion: 'EDITAR_TRAMITE',
      recursoId: '12',
      hasta: '2026-10-22',
    })
    expect(desdeParametros(aParametros(original))).toEqual(original)
  })

  it('"hay filtros" es verdadero con cualquiera de los seis', () => {
    expect(hayFiltros(SIN_FILTROS)).toBe(false)
    for (const clave of Object.keys(SIN_FILTROS) as (keyof FiltrosEscritos)[]) {
      expect(hayFiltros(filtros({ [clave]: 'x' }))).toBe(true)
    }
  })
})

describe('validar los filtros', () => {
  it('sin nada escrito todo es válido', () => {
    expect(validar(SIN_FILTROS)).toEqual({})
  })

  it.each(['1', '42', '999999999999'])('acepta el número %j', (numero) => {
    expect(validar(filtros({ actorId: numero, recursoId: numero }))).toEqual({})
  })

  it.each(['0', '-3', '1.5', 'abc', '07', '1e3', '1 2', '1000000000000', '+4'])(
    'rechaza el número %j',
    (numero) => {
      const errores = validar(filtros({ actorId: numero, recursoId: numero }))
      expect(errores.actorId).toBeTruthy()
      expect(errores.recursoId).toBeTruthy()
    },
  )

  it('cada número se revisa por separado', () => {
    expect(Object.keys(validar(filtros({ actorId: 'x', recursoId: '5' })))).toEqual(['actorId'])
    expect(Object.keys(validar(filtros({ actorId: '5', recursoId: 'x' })))).toEqual(['recursoId'])
  })

  it.each(['2026-10-22', '2024-02-29', '2026-12-31'])('acepta la fecha %j', (fecha) => {
    expect(validar(filtros({ desde: fecha, hasta: fecha }))).toEqual({})
  })

  it.each([
    '22/10/2026',
    '2026-1-5',
    '2026-13-01',
    '2026-02-30',
    '2025-02-29',
    '2026-10-32',
    'ayer',
    '2026-10-22T00:00',
  ])('rechaza la fecha %j', (fecha) => {
    const errores = validar(filtros({ desde: fecha, hasta: fecha }))
    expect(errores.desde).toBeTruthy()
    expect(errores.hasta).toBeTruthy()
  })

  it('"desde" posterior a "hasta" es un error en "hasta"; el mismo día es válido', () => {
    expect(validar(filtros({ desde: '2026-10-30', hasta: '2026-10-01' })).hasta).toMatch(
      /posterior/,
    )
    expect(validar(filtros({ desde: '2026-10-22', hasta: '2026-10-22' }))).toEqual({})
    expect(validar(filtros({ desde: '2026-10-01', hasta: '2026-10-30' }))).toEqual({})
  })

  it('con una fecha mal escrita no se compara el orden (un solo error por fecha)', () => {
    const errores = validar(filtros({ desde: '2026-13-01', hasta: '2026-10-01' }))
    expect(errores.desde).toMatch(/válida/)
    expect(errores.hasta).toBeUndefined()
  })

  it('el recurso y la acción no tienen reglas propias (son listas)', () => {
    expect(validar(filtros({ recurso: 'lo-que-sea', accion: 'OTRA_ACCION' }))).toEqual({})
  })
})

describe('aConsulta', () => {
  it('lo vacío no se manda y los números viajan como números', () => {
    expect(aConsulta(filtros({ actorId: '3', recursoId: '12' }), 2)).toEqual({
      recurso: undefined,
      accion: undefined,
      actorId: 3,
      recursoId: 12,
      desde: undefined,
      hasta: undefined,
      page: 2,
    })
  })

  it('pasa todos los filtros tal cual', () => {
    expect(
      aConsulta(
        filtros({
          recurso: 'pago',
          accion: 'VALIDACION_PAGO',
          desde: '2026-10-01',
          hasta: '2026-10-22',
        }),
        0,
      ),
    ).toMatchObject({
      recurso: 'pago',
      accion: 'VALIDACION_PAGO',
      desde: '2026-10-01',
      hasta: '2026-10-22',
      page: 0,
    })
  })
})

describe('valores de los cambios', () => {
  it('cada tipo se lee como corresponde', () => {
    expect(valorLegible('Hola')).toBe('Hola')
    expect(valorLegible(25.5)).toBe('25.5')
    expect(valorLegible(0)).toBe('0')
    expect(valorLegible(true)).toBe('Sí')
    expect(valorLegible(false)).toBe('No')
    expect(valorLegible(null)).toBe('(vacío)')
    expect(valorLegible(undefined)).toBe('(vacío)')
    expect(valorLegible('')).toBe('(vacío)')
    expect(valorLegible(['GESTOR', 'AUDITOR'])).toBe('["GESTOR","AUDITOR"]')
    expect(valorLegible({ a: 1 })).toBe('{"a":1}')
  })

  it('aplana el mapa en el orden en que llegó, y sin mapa no hay datos', () => {
    expect(aplanar({ nombre: 'Ana', activo: true, roles: ['A'] })).toEqual([
      { clave: 'nombre', valor: 'Ana' },
      { clave: 'activo', valor: 'Sí' },
      { clave: 'roles', valor: '["A"]' },
    ])
    expect(aplanar(null)).toEqual([])
    expect(aplanar(undefined)).toEqual([])
    expect(aplanar({})).toEqual([])
  })
})

describe('etiquetas', () => {
  it('traducen lo conocido y muestran tal cual lo desconocido', () => {
    expect(etiquetaDeAccion('VALIDACION_PAGO')).toBe('Pago validado')
    expect(etiquetaDeAccion('ACCION_NUEVA')).toBe('ACCION_NUEVA')
    expect(etiquetaDeRecurso('tipo_tramite')).toBe('Tipos de trámite')
    expect(etiquetaDeRecurso('recurso_nuevo')).toBe('recurso_nuevo')
  })

  it('las listas de los filtros están ordenadas por nombre y no repiten códigos', () => {
    for (const lista of [OPCIONES_ACCION, OPCIONES_RECURSO]) {
      const textos = lista.map((o) => o.texto)
      expect(textos).toEqual([...textos].sort((a, b) => a.localeCompare(b, 'es')))
      expect(new Set(lista.map((o) => o.valor)).size).toBe(lista.length)
    }
    expect(OPCIONES_RECURSO.map((o) => o.valor)).toContain('bitacora')
    expect(OPCIONES_ACCION.map((o) => o.valor)).toContain('CONSULTA_BITACORA')
  })

  it('un valor actual desconocido se agrega al final de la lista para poder verlo y quitarlo', () => {
    const base = [{ valor: 'a', texto: 'A' }]
    expect(conValorActual(base, 'a')).toBe(base)
    expect(conValorActual(base, '')).toBe(base)
    expect(conValorActual(base, 'z')).toEqual([...base, { valor: 'z', texto: 'z' }])
  })
})
