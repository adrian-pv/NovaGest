/** Tamaño máximo que acepta la API para un comprobante: 5 MB. */
export const TAMANO_MAXIMO = 5 * 1024 * 1024

/** Tipos que acepta la API (la API los reconoce por el contenido real, no por la extensión). */
export const TIPOS_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png']

/** Valor del atributo accept del selector de archivo. */
export const ACEPTADOS = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png'

const EXTENSIONES = ['.pdf', '.jpg', '.jpeg', '.png']

/**
 * Revisa el archivo antes de subirlo, para avisar de inmediato en vez de esperar a que lo rechace la API. Es solo
 * comodidad: la API vuelve a comprobar el tamaño y el contenido real. Devuelve el motivo del rechazo, o null.
 */
export function motivoDeRechazo(archivo: File): string | null {
  if (archivo.size === 0) return 'El archivo está vacío.'
  if (archivo.size > TAMANO_MAXIMO) {
    return `El archivo pesa ${megas(archivo.size)} MB y el máximo es 5 MB.`
  }
  const nombre = archivo.name.toLowerCase()
  const tipoValido = TIPOS_PERMITIDOS.includes(archivo.type)
  const extensionValida = EXTENSIONES.some((e) => nombre.endsWith(e))
  if (!tipoValido && !extensionValida) return 'Debe ser un archivo PDF, JPG o PNG.'
  return null
}

function megas(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1)
}

/** Tamaño legible: "850 KB" o "1.2 MB". */
export function tamanoLegible(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${megas(bytes)} MB`
}
