import type { Pagina, Perfil } from '../api/tipos'
import type {
  CampoTipo,
  Historial,
  TipoTramite,
  Tramite,
  TransicionDisponible,
} from '../api/tramites'

/** Pagina con la forma REAL de la API: los elementos en `content` y la paginación anidada en `page`. */
export function pagina<T>(content: T[], datos: Partial<Pagina<T>['page']> = {}): Pagina<T> {
  return {
    content,
    page: { size: 20, number: 0, totalElements: content.length, totalPages: 1, ...datos },
  }
}

export const CAMPOS: CampoTipo[] = [
  {
    clave: 'dpi',
    etiqueta: 'DPI de 13 dígitos',
    tipoDato: 'TEXTO',
    obligatorio: true,
    patron: '^[0-9]{13}$',
    minimo: null,
    orden: 1,
  },
  {
    clave: 'ingreso',
    etiqueta: 'Ingreso mensual',
    tipoDato: 'NUMERO',
    obligatorio: true,
    patron: null,
    minimo: 0,
    orden: 2,
  },
  {
    clave: 'nacimiento',
    etiqueta: 'Fecha de nacimiento',
    tipoDato: 'FECHA',
    obligatorio: false,
    patron: null,
    minimo: null,
    orden: 3,
  },
  {
    clave: 'casado',
    etiqueta: 'Está casado',
    tipoDato: 'BOOLEANO',
    obligatorio: false,
    patron: null,
    minimo: null,
    orden: 4,
  },
]

export const TIPO_ORNATO: TipoTramite = {
  id: 1,
  nombre: 'Boleto de ornato',
  descripcion: 'Pago del boleto de ornato',
  monto: 25,
  activo: true,
  campos: CAMPOS,
}

export const TIPO_IGSS: TipoTramite = {
  id: 2,
  nombre: 'Pago de IGSS',
  descripcion: null,
  monto: 0,
  activo: true,
  campos: [CAMPOS[0]],
}

export const TIPO_INACTIVO: TipoTramite = {
  ...TIPO_ORNATO,
  id: 9,
  nombre: 'Tipo retirado',
  activo: false,
}

export function tramite(extra: Partial<Tramite> = {}): Tramite {
  return {
    id: 12,
    tipoId: 1,
    tipoNombre: 'Boleto de ornato',
    ciudadanoId: 7,
    gestorId: null,
    estado: 'BORRADOR',
    datos: { dpi: '1234567890123', ingreso: 3500.5, nacimiento: '1990-03-05', casado: true },
    motivo: null,
    destinosPosibles: ['ENVIADO'],
    creadoEn: '2026-10-20T19:54:00Z',
    actualizadoEn: '2026-10-20T19:54:00Z',
    ...extra,
  }
}

export function accion(extra: Partial<TransicionDisponible> = {}): TransicionDisponible {
  return {
    accion: 'ENVIAR',
    estadoDestino: 'ENVIADO',
    comentarioObligatorio: false,
    ejecutable: true,
    motivo: null,
    ...extra,
  }
}

export const HISTORIAL: Historial[] = [
  {
    id: 1,
    estadoAnterior: null,
    estadoNuevo: 'BORRADOR',
    actorId: 7,
    comentario: null,
    fecha: '2026-10-20T19:54:00Z',
  },
  {
    id: 2,
    estadoAnterior: 'BORRADOR',
    estadoNuevo: 'ENVIADO',
    actorId: 7,
    comentario: null,
    fecha: '2026-10-20T19:55:00Z',
  },
  {
    id: 3,
    estadoAnterior: 'ENVIADO',
    estadoNuevo: 'OBSERVADO',
    actorId: 3,
    comentario: 'Falta la dirección',
    fecha: '2026-10-20T19:56:00Z',
  },
]

export const GESTOR: Perfil = {
  id: 3,
  correo: 'gestor@demo.com',
  nombre: 'Gabriel Gestor',
  roles: ['GESTOR'],
  permisos: ['tramite:leer', 'tramite:editar', 'tipo_tramite:leer', 'pago:leer', 'pago:editar'],
  alcanceTotal: true,
}
