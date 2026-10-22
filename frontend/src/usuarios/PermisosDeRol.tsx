import { agruparPermisos } from './permisos'

/** Los permisos de un rol agrupados por recurso, en lenguaje corriente: "Trámites: consultar, crear". */
export default function PermisosDeRol({ permisos }: { permisos: string[] }) {
  const grupos = agruparPermisos(permisos)
  if (grupos.length === 0) return <p className="campo__ayuda">Este rol no tiene permisos.</p>
  return (
    <dl className="permisos">
      {grupos.map((g) => (
        <div key={g.recurso} className="permisos__fila">
          <dt>{g.etiqueta}</dt>
          <dd>{g.acciones.length > 0 ? g.acciones.join(', ') : 'sin acciones'}</dd>
        </div>
      ))}
    </dl>
  )
}
