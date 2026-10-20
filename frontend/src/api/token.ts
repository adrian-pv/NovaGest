/**
 * El token de acceso vive solo en memoria: no se guarda en localStorage ni sessionStorage, así un script
 * inyectado no puede robarlo del almacenamiento del navegador. Al recargar la página se pierde y la sesión
 * se recupera con el token de renovación (ver src/sesion/almacen.ts).
 */
let tokenDeAcceso: string | null = null
let venceEn: number | null = null

/** Margen para considerar vencido un token un instante antes de que lo rechace el servidor. */
const MARGEN_MS = 15_000

export function guardarToken(token: string | null, expiraEnSegundos?: number): void {
  tokenDeAcceso = token
  venceEn =
    token !== null && expiraEnSegundos !== undefined ? Date.now() + expiraEnSegundos * 1000 : null
}

export function leerToken(): string | null {
  return tokenDeAcceso
}

/** Verdadero si se sabe que el token de acceso ya venció o está por vencer. Sin dato de vencimiento, falso. */
export function tokenVencido(): boolean {
  return venceEn !== null && Date.now() >= venceEn - MARGEN_MS
}
