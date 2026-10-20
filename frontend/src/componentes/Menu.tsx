import { NavLink } from 'react-router-dom'
import { useSesion } from '../sesion/contexto'
import { ITEMS_MENU, itemsVisibles, type ItemMenu } from '../sesion/navegacion'

export default function Menu({ items = ITEMS_MENU }: { items?: ItemMenu[] }) {
  const { estado, tienePermiso } = useSesion()
  const visibles = itemsVisibles(items, { autenticado: estado === 'autenticado', tienePermiso })
  return (
    <nav aria-label="Principal">
      <ul className="menu">
        {visibles.map((item) => (
          <li key={item.ruta}>
            <NavLink
              to={item.ruta}
              end={item.ruta === '/'}
              className={({ isActive }) =>
                isActive ? 'menu__enlace menu__enlace--activo' : 'menu__enlace'
              }
            >
              {item.etiqueta}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
