import type { Perfil } from '../api/tipos'

interface Capacidad {
  permiso: string
  /** Si se indica, solo aplica según el alcance del rol (true: ve todo, false: solo lo propio). */
  alcanceTotal?: boolean
  texto: string
}

/**
 * Qué puede hacer una persona, en palabras, según los permisos que tiene. Se usa en el panel para que cada rol vea
 * de un vistazo lo suyo. Es solo informativo: lo que realmente se puede hacer lo decide la API.
 */
const CAPACIDADES: Capacidad[] = [
  { permiso: 'tramite:crear', texto: 'Crear y enviar trámites' },
  {
    permiso: 'tramite:leer',
    alcanceTotal: false,
    texto: 'Consultar y dar seguimiento a tus trámites',
  },
  {
    permiso: 'tramite:leer',
    alcanceTotal: true,
    texto: 'Consultar los trámites de todas las personas',
  },
  {
    permiso: 'tramite:editar',
    alcanceTotal: true,
    texto: 'Revisar trámites: tomarlos, observarlos, aprobarlos o rechazarlos',
  },
  { permiso: 'pago:crear', texto: 'Subir comprobantes de pago' },
  { permiso: 'pago:editar', texto: 'Validar o rechazar pagos' },
  { permiso: 'ingreso:leer', texto: 'Registrar y consultar tus ingresos' },
  { permiso: 'tipo_tramite:crear', texto: 'Administrar los tipos de trámite' },
  { permiso: 'usuario:crear', texto: 'Administrar usuarios y roles' },
  { permiso: 'bitacora:leer', texto: 'Consultar la bitácora de auditoría' },
]

export function capacidadesDe(perfil: Perfil): string[] {
  return CAPACIDADES.filter(
    (c) =>
      perfil.permisos.includes(c.permiso) &&
      (c.alcanceTotal === undefined || c.alcanceTotal === perfil.alcanceTotal),
  ).map((c) => c.texto)
}
