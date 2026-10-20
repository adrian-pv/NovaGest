/**
 * Dónde se guarda el token de renovación para sobrevivir a una recarga de la página (F5).
 *
 * Decisión de seguridad: sessionStorage y no localStorage. Se borra al cerrar la pestaña, no se comparte entre
 * pestañas y la API lo limita: es de un solo uso, rota en cada canje y si alguien reusa uno viejo se revocan
 * todas las sesiones. Un script inyectado (XSS) podría leerlo, igual que podría actuar con la sesión abierta;
 * la defensa de fondo es la política de contenido (tarjeta 26 y 42). La alternativa más estricta, no guardarlo
 * (la sesión se pierde al recargar), cuesta solo cambiar estas tres funciones.
 *
 * El token de acceso nunca pasa por aquí: vive solo en memoria (src/api/token.ts).
 */
const CLAVE = 'novagest.renovacion'

export function guardarRenovacion(token: string): void {
  try {
    sessionStorage.setItem(CLAVE, token)
  } catch {
    // Almacenamiento bloqueado (modo privado estricto): la sesión dura hasta recargar la página
  }
}

export function leerRenovacion(): string | null {
  try {
    return sessionStorage.getItem(CLAVE)
  } catch {
    return null
  }
}

export function borrarRenovacion(): void {
  try {
    sessionStorage.removeItem(CLAVE)
  } catch {
    // Nada que borrar
  }
}
