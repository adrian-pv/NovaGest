/**
 * Entrega al navegador un archivo ya descargado para que la persona lo guarde. El nombre que sugiere la API ya viene
 * depurado; si no vino uno, se usa el de respaldo. Libera la dirección temporal al terminar.
 */
export function guardarArchivo(contenido: Blob, nombre: string | null, respaldo: string): void {
  const direccion = URL.createObjectURL(contenido)
  const enlace = document.createElement('a')
  enlace.href = direccion
  enlace.download = nombre ?? respaldo
  enlace.rel = 'noopener'
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  // Se libera después del clic: algunos navegadores necesitan un instante para iniciar la descarga
  setTimeout(() => URL.revokeObjectURL(direccion), 1000)
}
