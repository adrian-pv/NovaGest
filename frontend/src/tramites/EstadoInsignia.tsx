import type { EstadoTramite } from '../api/tramites'
import Insignia from '../componentes/Insignia'
import { ETIQUETA_ESTADO, TONO_ESTADO } from './etiquetas'

/** El estado de un trámite con el color que corresponde (verde final, rojo rechazado, ámbar si espera a la persona). */
export default function EstadoInsignia({ estado }: { estado: EstadoTramite }) {
  return <Insignia tono={TONO_ESTADO[estado]}>{ETIQUETA_ESTADO[estado]}</Insignia>
}
