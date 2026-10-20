import { solicitar } from './cliente'
import type { Salud } from './tipos'

/** Estado del servidor. Es público y no revela detalles internos. */
export function consultarSalud(senal?: AbortSignal): Promise<Salud> {
  return solicitar<Salud>('/actuator/health', { sinToken: true, senal })
}
