import { vi } from 'vitest'
import type { Perfil, TokenResponse } from '../api/tipos'

export interface Llamada {
  metodo: string
  ruta: string
  cabeceras: Record<string, string>
  cuerpo: unknown
}

export type Manejador = (llamada: Llamada) => Response | Promise<Response>

export function json(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function problema(estado: number, detail: string, errores?: unknown[]): Response {
  return json({ title: 'Error', status: estado, detail, errores }, estado)
}

export function tokens(sufijo: string): TokenResponse {
  return {
    accessToken: `acceso-${sufijo}`,
    refreshToken: `renovacion-${sufijo}`,
    tipo: 'Bearer',
    expiraEnSegundos: 900,
  }
}

export const PERFIL_CIUDADANA: Perfil = {
  id: 7,
  correo: 'ana@demo.com',
  nombre: 'Ana López',
  roles: ['CIUDADANO'],
  permisos: ['tramite:leer', 'tramite:crear'],
  alcanceTotal: false,
}

/**
 * Reemplaza fetch por una API simulada. Las claves son "MÉTODO /ruta"; lo que no está registrado responde 404.
 * Devuelve la lista de llamadas hechas, en orden, para comprobar qué se pidió y con qué cabeceras.
 */
export function simularApi(rutas: Record<string, Manejador>): Llamada[] {
  const llamadas: Llamada[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const llamada: Llamada = {
        metodo: init?.method ?? 'GET',
        ruta: url,
        cabeceras: (init?.headers ?? {}) as Record<string, string>,
        cuerpo: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
      }
      llamadas.push(llamada)
      // Se busca la ruta exacta (con su consulta) y, si no está, la ruta sin consulta
      const manejador =
        rutas[`${llamada.metodo} ${llamada.ruta}`] ??
        rutas[`${llamada.metodo} ${llamada.ruta.split('?')[0]}`]
      return manejador ? manejador(llamada) : new Response(null, { status: 404 })
    }),
  )
  return llamadas
}
