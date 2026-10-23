import type { RegistroBitacora } from '../api/bitacora'
import { aplanar, type DatoDeCambio } from './detalle'

function Datos({ titulo, datos }: { titulo: string; datos: DatoDeCambio[] }) {
  return (
    <div className="cambio">
      <h4>{titulo}</h4>
      {datos.length === 0 ? (
        <p className="campo__ayuda">Sin datos.</p>
      ) : (
        <dl className="permisos">
          {datos.map((d) => (
            <div key={d.clave} className="permisos__fila">
              <dt>{d.clave}</dt>
              <dd>{d.valor}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

/**
 * Lo que cambió con una acción: los datos de "antes" y de "después" que dejó el sistema. Se muestran como texto (React
 * lo escapa), sin interpretar nada. Un registro sin datos de ninguno de los dos lados no tiene nada que desplegar.
 */
export default function DetalleRegistro({ registro }: { registro: RegistroBitacora }) {
  const antes = aplanar(registro.antes)
  const despues = aplanar(registro.despues)
  if (antes.length === 0 && despues.length === 0)
    return <span aria-label="Sin cambios registrados">—</span>
  return (
    <details>
      <summary aria-label={`Ver los cambios del registro ${registro.id}`}>Ver cambios</summary>
      <Datos titulo="Antes" datos={antes} />
      <Datos titulo="Después" datos={despues} />
    </details>
  )
}
