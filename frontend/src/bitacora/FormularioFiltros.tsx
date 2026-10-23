import { useState, type FormEvent } from 'react'
import Boton from '../componentes/Boton'
import Campo from '../componentes/Campo'
import Seleccion from '../componentes/Seleccion'
import { OPCIONES_ACCION, OPCIONES_RECURSO, conValorActual } from './etiquetas'
import { SIN_FILTROS, validar, type ErroresFiltros, type FiltrosEscritos } from './filtros'

interface Props {
  /** Lo que dice la dirección ahora mismo. Si cambia, el formulario se reinicia (se le pone otra `key`). */
  inicial: FiltrosEscritos
  /** Errores de lo que ya está en la dirección (un número mal escrito en un enlace compartido). */
  erroresDeLaDireccion: ErroresFiltros
  onAplicar: (filtros: FiltrosEscritos) => void
}

/** Filtros de la bitácora. Los errores de lo que se escribe aparecen al filtrar, no mientras se teclea. */
export default function FormularioFiltros({ inicial, erroresDeLaDireccion, onAplicar }: Props) {
  const [escritos, setEscritos] = useState(inicial)
  const [intentado, setIntentado] = useState(false)
  const errores = intentado ? validar(escritos) : erroresDeLaDireccion

  function cambiar(cambios: Partial<FiltrosEscritos>) {
    setEscritos((actuales) => ({ ...actuales, ...cambios }))
  }

  function aplicar(evento: FormEvent) {
    evento.preventDefault()
    setIntentado(true)
    if (Object.keys(validar(escritos)).length === 0) onAplicar(escritos)
  }

  return (
    <form className="tarjeta filtros" onSubmit={aplicar} aria-label="Filtros" noValidate>
      <Seleccion
        etiqueta="Recurso"
        opcionVacia="Todos"
        opciones={conValorActual(OPCIONES_RECURSO, escritos.recurso)}
        value={escritos.recurso}
        onChange={(e) => cambiar({ recurso: e.target.value })}
      />
      <Seleccion
        etiqueta="Acción"
        opcionVacia="Todas"
        opciones={conValorActual(OPCIONES_ACCION, escritos.accion)}
        value={escritos.accion}
        onChange={(e) => cambiar({ accion: e.target.value })}
      />
      <Campo
        etiqueta="Usuario (número)"
        ayuda="Quien hizo la acción. Lo ves en la columna Persona."
        inputMode="numeric"
        autoComplete="off"
        error={errores.actorId}
        value={escritos.actorId}
        onChange={(e) => cambiar({ actorId: e.target.value })}
      />
      <Campo
        etiqueta="Registro afectado (número)"
        ayuda="El número del trámite, pago, usuario... sobre el que se actuó."
        inputMode="numeric"
        autoComplete="off"
        error={errores.recursoId}
        value={escritos.recursoId}
        onChange={(e) => cambiar({ recursoId: e.target.value })}
      />
      <Campo
        etiqueta="Desde"
        type="date"
        error={errores.desde}
        value={escritos.desde}
        onChange={(e) => cambiar({ desde: e.target.value })}
      />
      <Campo
        etiqueta="Hasta (incluida)"
        type="date"
        error={errores.hasta}
        value={escritos.hasta}
        onChange={(e) => cambiar({ hasta: e.target.value })}
      />
      <div className="filtros__acciones">
        <Boton type="submit">Filtrar</Boton>
        <Boton
          variante="secundario"
          onClick={() => {
            setEscritos(SIN_FILTROS)
            setIntentado(false)
            onAplicar(SIN_FILTROS)
          }}
        >
          Limpiar
        </Boton>
      </div>
    </form>
  )
}
