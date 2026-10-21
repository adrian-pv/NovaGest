import { describe, expect, it } from 'vitest'
import { ErrorApi } from '../api/errores'
import type { UsuarioAdmin } from '../api/usuarios'
import {
  MAX_ROLES,
  alternarRol,
  desdeUsuario,
  erroresDelServidor,
  formularioVacio,
  validarCreacion,
  validarEdicion,
  type FormUsuario,
} from './formulario'
import { agruparPermisos, textoDeAlcance } from './permisos'

function valido(extra: Partial<FormUsuario> = {}): FormUsuario {
  return {
    nombre: 'Ana López',
    correo: 'ana@demo.com',
    clave: 'ClaveSegura1',
    activo: true,
    roles: ['CIUDADANO'],
    ...extra,
  }
}

describe('desdeUsuario', () => {
  it('copia el nombre, el correo, el estado y los roles, y deja la clave vacía', () => {
    const usuario: UsuarioAdmin = {
      id: 5,
      correo: 'rodolfo@demo.com',
      nombre: 'Rodolfo',
      activo: false,
      bloqueado: true,
      roles: ['GESTOR', 'AUDITOR'],
      creadoEn: '2026-10-21T10:00:00Z',
      actualizadoEn: '2026-10-21T10:00:00Z',
    }

    const form = desdeUsuario(usuario)

    expect(form).toEqual({
      nombre: 'Rodolfo',
      correo: 'rodolfo@demo.com',
      clave: '',
      activo: false,
      roles: ['GESTOR', 'AUDITOR'],
    })
    // Es una copia: cambiar el formulario no toca al usuario
    form.roles.push('X')
    expect(usuario.roles).toEqual(['GESTOR', 'AUDITOR'])
  })
})

describe('alternarRol', () => {
  it('agrega y quita un rol sin repetirlo', () => {
    expect(alternarRol(['A'], 'B', true)).toEqual(['A', 'B'])
    expect(alternarRol(['A', 'B'], 'A', false)).toEqual(['B'])
    expect(alternarRol(['A'], 'A', true)).toEqual(['A'])
    expect(alternarRol([], 'A', false)).toEqual([])
  })

  it('no pasa del máximo de roles que acepta la API', () => {
    const lleno = Array.from({ length: MAX_ROLES }, (_, i) => `R${i}`)
    expect(alternarRol(lleno, 'NUEVO', true)).toEqual(lleno)
    expect(alternarRol(lleno, 'R0', true)).toHaveLength(MAX_ROLES)
    expect(alternarRol(lleno, 'R0', false)).toHaveLength(MAX_ROLES - 1)
  })

  it('no modifica la lista original', () => {
    const original = ['A']
    alternarRol(original, 'B', true)
    expect(original).toEqual(['A'])
  })
})

describe('validarCreacion', () => {
  it('un formulario vacío pide todo y no genera solicitud', () => {
    const { errores, solicitud } = validarCreacion(formularioVacio())

    expect(solicitud).toBeUndefined()
    expect(errores.nombre).toBeTruthy()
    expect(errores.correo).toBeTruthy()
    expect(errores.clave).toBeTruthy()
    expect(errores.roles).toBeTruthy()
  })

  it('arma la solicitud con el nombre y el correo sin espacios', () => {
    const { solicitud } = validarCreacion(
      valido({ nombre: '  Ana López ', correo: ' ana@demo.com ', roles: ['GESTOR', 'AUDITOR'] }),
    )

    expect(solicitud).toEqual({
      nombre: 'Ana López',
      correo: 'ana@demo.com',
      clave: 'ClaveSegura1',
      roles: ['GESTOR', 'AUDITOR'],
    })
  })

  it('no manda "activo": al crear la cuenta queda activa por defecto en la API', () => {
    expect(validarCreacion(valido()).solicitud).not.toHaveProperty('activo')
  })

  it('el nombre tiene el mismo límite que la API', () => {
    expect(validarCreacion(valido({ nombre: 'a'.repeat(120) })).solicitud).toBeDefined()
    expect(validarCreacion(valido({ nombre: 'a'.repeat(121) })).errores.nombre).toBeTruthy()
    expect(validarCreacion(valido({ nombre: '   ' })).errores.nombre).toBeTruthy()
  })

  it.each(['ana@demo.com', 'a.b+c@sub.dominio.gt', 'x@y.z'])('acepta el correo %j', (correo) => {
    expect(validarCreacion(valido({ correo })).errores.correo).toBeUndefined()
  })

  it.each(['', '   ', 'ana', 'ana@', '@demo.com', 'ana@demo', 'a na@demo.com', 'a@@demo.com'])(
    'rechaza el correo %j',
    (correo) => {
      expect(validarCreacion(valido({ correo })).errores.correo).toBeTruthy()
    },
  )

  it('el correo no puede pasar de 254 caracteres', () => {
    const largo = `${'a'.repeat(250)}@d.co`
    expect(validarCreacion(valido({ correo: largo })).errores.correo).toBeTruthy()
  })

  it('la clave va de 8 a 72 caracteres y se respeta tal cual (los espacios cuentan)', () => {
    expect(validarCreacion(valido({ clave: '1234567' })).errores.clave).toBeTruthy()
    expect(validarCreacion(valido({ clave: '12345678' })).errores.clave).toBeUndefined()
    expect(validarCreacion(valido({ clave: 'a'.repeat(72) })).errores.clave).toBeUndefined()
    expect(validarCreacion(valido({ clave: 'a'.repeat(73) })).errores.clave).toBeTruthy()
    // Ocho espacios son ocho caracteres: la API es quien decide si le sirven
    expect(validarCreacion(valido({ clave: '        ' })).errores.clave).toBeUndefined()
    expect(validarCreacion(valido({ clave: ' abcdefg ' })).solicitud?.clave).toBe(' abcdefg ')
  })

  it('ningún mensaje de error repite la clave escrita', () => {
    const { errores } = validarCreacion(valido({ clave: 'corta' }))
    expect(JSON.stringify(errores)).not.toContain('corta')
  })

  it('exige al menos un rol y no más de los que acepta la API', () => {
    expect(validarCreacion(valido({ roles: [] })).errores.roles).toBeTruthy()
    const muchos = Array.from({ length: MAX_ROLES + 1 }, (_, i) => `R${i}`)
    expect(validarCreacion(valido({ roles: muchos })).errores.roles).toBeTruthy()
    expect(validarCreacion(valido({ roles: muchos.slice(0, MAX_ROLES) })).solicitud).toBeDefined()
  })
})

describe('validarEdicion', () => {
  it('manda el nombre, el estado y los roles, y nada más (ni correo ni clave)', () => {
    const { solicitud } = validarEdicion(
      valido({ nombre: ' Ana ', activo: false, roles: ['AUDITOR'] }),
    )

    expect(solicitud).toEqual({ nombre: 'Ana', activo: false, roles: ['AUDITOR'] })
  })

  it('no revisa el correo ni la clave, que aquí no se cambian', () => {
    expect(validarEdicion(valido({ correo: 'roto', clave: '' })).solicitud).toBeDefined()
  })

  it('exige el nombre y al menos un rol', () => {
    const { errores, solicitud } = validarEdicion(valido({ nombre: '', roles: [] }))
    expect(solicitud).toBeUndefined()
    expect(errores.nombre).toBeTruthy()
    expect(errores.roles).toBeTruthy()
  })
})

describe('erroresDelServidor', () => {
  const error = (errores: { campo: string; motivo: string }[]) =>
    new ErrorApi(400, 'La solicitud tiene datos inválidos.', errores)

  it('pone cada error junto a su campo y no deja nada para el aviso', () => {
    const { errores, aviso } = erroresDelServidor(
      error([
        { campo: 'correo', motivo: 'formato incorrecto' },
        { campo: 'clave', motivo: 'el tamaño debe estar entre 8 y 72' },
        { campo: 'roles', motivo: 'No existe el rol FANTASMA' },
        { campo: 'nombre', motivo: 'no debe estar vacío' },
      ]),
    )

    expect(aviso).toBeNull()
    expect(errores).toEqual({
      correo: 'formato incorrecto',
      clave: 'el tamaño debe estar entre 8 y 72',
      roles: 'No existe el rol FANTASMA',
      nombre: 'no debe estar vacío',
    })
  })

  it('un error de un campo que el formulario no tiene va al aviso, sin repetir los que ya se ubicaron', () => {
    const { errores, aviso } = erroresDelServidor(
      error([
        { campo: 'nombre', motivo: 'no debe estar vacío' },
        { campo: 'activo', motivo: 'no debe ser nulo' },
      ]),
    )

    expect(errores.nombre).toBe('no debe estar vacío')
    expect((aviso as ErrorApi).errores).toEqual([{ campo: 'activo', motivo: 'no debe ser nulo' }])
    expect((aviso as ErrorApi).estado).toBe(400)
  })

  it('un 409 (propio rol, correo repetido), un fallo de red o un error propio van enteros al aviso', () => {
    const conflicto = new ErrorApi(
      409,
      'No puedes cambiar tus propios roles ni desactivar tu propia cuenta',
    )
    expect(erroresDelServidor(conflicto).aviso).toBe(conflicto)
    expect(erroresDelServidor(conflicto).errores).toEqual({})
    const red = ErrorApi.sinConexion()
    expect(erroresDelServidor(red).aviso).toBe(red)
    const propio = new Error('fallo')
    expect(erroresDelServidor(propio).aviso).toBe(propio)
  })
})

describe('agruparPermisos', () => {
  it('agrupa por recurso, con nombres en español y las acciones en orden natural', () => {
    const grupos = agruparPermisos([
      'pago:crear',
      'tramite:eliminar',
      'tramite:crear',
      'tramite:leer',
      'tramite:editar',
      'pago:leer',
    ])

    expect(grupos).toEqual([
      { recurso: 'pago', etiqueta: 'Pagos', acciones: ['consultar', 'crear'] },
      {
        recurso: 'tramite',
        etiqueta: 'Trámites',
        acciones: ['consultar', 'crear', 'editar', 'eliminar'],
      },
    ])
  })

  it('traduce tipo_tramite y ordena los grupos por su nombre en español', () => {
    const etiquetas = agruparPermisos([
      'usuario:leer',
      'tipo_tramite:leer',
      'bitacora:leer',
      'rol:leer',
      'ingreso:leer',
    ]).map((g) => g.etiqueta)

    expect(etiquetas).toEqual(['Bitácora', 'Ingresos', 'Roles', 'Tipos de trámite', 'Usuarios'])
  })

  it('un recurso o una acción desconocidos se muestran tal cual, y la desconocida va al final', () => {
    const grupos = agruparPermisos([
      'informe:exportar',
      'informe:leer',
      'tramite:aprobar',
      'tramite:crear',
    ])

    expect(grupos).toEqual([
      { recurso: 'informe', etiqueta: 'informe', acciones: ['consultar', 'exportar'] },
      { recurso: 'tramite', etiqueta: 'Trámites', acciones: ['crear', 'aprobar'] },
    ])
  })

  it('un permiso sin ":" se conserva como grupo propio, sin acciones', () => {
    expect(agruparPermisos(['raro'])).toEqual([{ recurso: 'raro', etiqueta: 'raro', acciones: [] }])
  })

  it('sin permisos no hay grupos, y no modifica la lista recibida', () => {
    expect(agruparPermisos([])).toEqual([])
    const original = ['tramite:leer', 'tramite:crear']
    agruparPermisos(original)
    expect(original).toEqual(['tramite:leer', 'tramite:crear'])
  })
})

describe('textoDeAlcance', () => {
  it('explica si el rol ve todo o solo lo propio', () => {
    expect(textoDeAlcance(true)).toMatch(/todas las personas/)
    expect(textoDeAlcance(false)).toMatch(/solo sus propios/)
  })
})
