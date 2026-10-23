/** Un dato de "antes" o "después" listo para mostrar: su nombre y su valor como texto. */
export interface DatoDeCambio {
  clave: string
  valor: string
}

/**
 * Un valor de la bitácora como texto. Los textos y números salen tal cual; verdadero y falso se leen "Sí" y "No"; un
 * valor vacío se dice "(vacío)"; las listas y los objetos van como JSON, sin recortarlos ni interpretarlos.
 */
export function valorLegible(valor: unknown): string {
  if (valor === null || valor === undefined) return '(vacío)'
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No'
  if (typeof valor === 'string') return valor === '' ? '(vacío)' : valor
  if (typeof valor === 'number' || typeof valor === 'bigint') return String(valor)
  return JSON.stringify(valor)
}

/** Pasa el mapa de la API a una lista de datos, en el orden en que llegaron. Sin mapa no hay datos. */
export function aplanar(mapa: Record<string, unknown> | null | undefined): DatoDeCambio[] {
  if (!mapa) return []
  return Object.entries(mapa).map(([clave, valor]) => ({ clave, valor: valorLegible(valor) }))
}
