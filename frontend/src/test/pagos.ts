import type { Pago } from '../api/pagos'

/** Un pago con la forma que devuelve la API. Por defecto: pendiente, un PDF de 1 KB. */
export function pago(extra: Partial<Pago> = {}): Pago {
  return {
    id: 5,
    tramiteId: 12,
    monto: 25,
    estado: 'PENDIENTE',
    comprobanteTipo: 'application/pdf',
    comprobanteTamano: 1024,
    comprobanteHash: 'a'.repeat(64),
    creadoPor: 7,
    validadoPor: null,
    validadoEn: null,
    comentario: null,
    tramiteEstado: null,
    creadoEn: '2026-10-20T20:18:00Z',
    ...extra,
  }
}

/** Un archivo de prueba con el contenido y el tamaño indicados. */
export function archivo(nombre: string, tipo: string, tamano = 1024): File {
  return new File([new Uint8Array(tamano)], nombre, { type: tipo })
}

/** Respuesta de descarga de la API: el contenido y la cabecera con el nombre sugerido. */
export function descarga(nombreSugerido: string | null, tipo = 'application/pdf'): Response {
  const cabeceras: Record<string, string> = { 'Content-Type': tipo }
  if (nombreSugerido !== null) {
    cabeceras['Content-Disposition'] = `attachment; filename="${nombreSugerido}"`
  }
  // Bytes y no un Blob: en estas pruebas Blob es el de jsdom y el Response de Node no lo acepta
  return new Response(new TextEncoder().encode('contenido'), { status: 200, headers: cabeceras })
}
