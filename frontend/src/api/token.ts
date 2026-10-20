/**
 * El token de acceso vive solo en memoria: no se guarda en localStorage ni sessionStorage, así un script
 * inyectado no puede robarlo del almacenamiento del navegador. Al recargar la página se pierde y la sesión
 * se recupera con el token de renovación (tarjeta 31).
 */
let tokenDeAcceso: string | null = null

export function guardarToken(token: string | null): void {
  tokenDeAcceso = token
}

export function leerToken(): string | null {
  return tokenDeAcceso
}
