import { solicitar } from './cliente'
import type { Pagina } from './tipos'

/**
 * Una fila de la bitácora tal como la entrega la API. `actorId` y `actorCorreo` vienen vacíos cuando la acción la hizo
 * el sistema (la tarea diaria de tipos de cambio, por ejemplo) o no hay una persona identificada. El correo llega
 * enmascarado (a***@dominio.com) y así se muestra: la interfaz nunca intenta completarlo.
 */
export interface RegistroBitacora {
  id: number
  actorId: number | null
  actorCorreo: string | null
  accion: string
  recurso: string
  recursoId: number | null
  /** Lo que había antes de la acción y lo que quedó después (solo lo necesario para entender el cambio). */
  antes: Record<string, unknown> | null
  despues: Record<string, unknown> | null
  ip: string | null
  fecha: string
}

export interface FiltroBitacora {
  recurso?: string
  recursoId?: number
  accion?: string
  actorId?: number
  /** AAAA-MM-DD en hora de Guatemala, incluida completa. */
  desde?: string
  hasta?: string
  page?: number
}

/**
 * Consulta la bitácora (permiso bitacora:leer), del registro más reciente al más antiguo, de 20 en 20. Los filtros se
 * combinan con "y" y coinciden de forma exacta. Ojo: cada consulta deja constancia en la propia bitácora.
 */
export function consultarBitacora(
  filtro: FiltroBitacora,
  senal?: AbortSignal,
): Promise<Pagina<RegistroBitacora>> {
  return solicitar<Pagina<RegistroBitacora>>('/api/bitacora', {
    consulta: {
      recurso: filtro.recurso,
      recursoId: filtro.recursoId,
      accion: filtro.accion,
      actorId: filtro.actorId,
      desde: filtro.desde,
      hasta: filtro.hasta,
      page: filtro.page ?? 0,
    },
    senal,
  })
}
