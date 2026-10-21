import { describe, expect, it } from 'vitest'
import { itemsVisibles, ITEMS_MENU, type ItemMenu } from './navegacion'

const ITEMS: ItemMenu[] = [
  { ruta: '/', etiqueta: 'Inicio' },
  { ruta: '/bandeja', etiqueta: 'Bandeja', permiso: 'tramite:leer', alcanceTotal: true },
  { ruta: '/solo-alcance', etiqueta: 'Solo alcance', alcanceTotal: true },
]

const rutas = (items: ItemMenu[]) => items.map((i) => i.ruta)
const todosLosPermisos = () => true

describe('menú: elementos que exigen alcance total', () => {
  it('con alcance total y el permiso ve la bandeja', () => {
    const visibles = itemsVisibles(ITEMS, {
      autenticado: true,
      tienePermiso: todosLosPermisos,
      alcanceTotal: true,
    })

    expect(rutas(visibles)).toEqual(['/', '/bandeja', '/solo-alcance'])
  })

  it('con el permiso pero sin alcance total (ciudadanía) no la ve', () => {
    const visibles = itemsVisibles(ITEMS, {
      autenticado: true,
      tienePermiso: todosLosPermisos,
      alcanceTotal: false,
    })

    expect(rutas(visibles)).toEqual(['/'])
  })

  it('si el dato de alcance no viene, se toma como falso', () => {
    const visibles = itemsVisibles(ITEMS, { autenticado: true, tienePermiso: todosLosPermisos })

    expect(rutas(visibles)).toEqual(['/'])
  })

  it('con alcance total pero sin el permiso tampoco ve la bandeja', () => {
    const visibles = itemsVisibles(ITEMS, {
      autenticado: true,
      tienePermiso: () => false,
      alcanceTotal: true,
    })

    expect(rutas(visibles)).toEqual(['/', '/solo-alcance'])
  })

  it('sin sesión nunca ve lo que exige alcance total', () => {
    const visibles = itemsVisibles(ITEMS, {
      autenticado: false,
      tienePermiso: todosLosPermisos,
      alcanceTotal: true,
    })

    expect(rutas(visibles)).toEqual(['/'])
  })

  it('el menú real ofrece la bandeja solo al personal con alcance total', () => {
    const personal = itemsVisibles(ITEMS_MENU, {
      autenticado: true,
      tienePermiso: todosLosPermisos,
      alcanceTotal: true,
    })
    const ciudadania = itemsVisibles(ITEMS_MENU, {
      autenticado: true,
      tienePermiso: todosLosPermisos,
      alcanceTotal: false,
    })

    expect(rutas(personal)).toContain('/bandeja')
    expect(rutas(ciudadania)).not.toContain('/bandeja')
    expect(rutas(ciudadania)).toContain('/tramites')
  })
})
