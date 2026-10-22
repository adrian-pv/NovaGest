/** Captura el frontend real con API simulada y datos ficticios. No usa cuentas ni credenciales reales. */
import { mkdir } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Indica PLAYWRIGHT_MODULE (ruta al index.mjs de Playwright)')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const base = process.env.MANUAL_BASE_URL ?? 'http://127.0.0.1:5173'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Solo se admiten servidores locales')
const salida = fileURLToPath(new URL('./capturas/', import.meta.url))
await mkdir(salida, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.MANUAL_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const fecha = '2026-10-21T18:00:00Z'
const comunes = ['tramite:leer', 'tipo_tramite:leer', 'pago:leer']
const perfiles = {
  CIUDADANO: { id: 7, nombre: 'Ciudadano Demo', permisos: [...comunes, 'tramite:crear', 'tramite:editar', 'pago:crear'] },
  GESTOR: { id: 3, nombre: 'Gestor Demo', permisos: [...comunes, 'tramite:editar', 'pago:editar'] },
  AUDITOR: { id: 4, nombre: 'Auditor Demo', permisos: [...comunes, 'usuario:leer', 'rol:leer'] },
  ADMINISTRADOR: { id: 5, nombre: 'Administrador Demo', permisos: ['usuario:leer', 'usuario:crear', 'usuario:editar', 'rol:leer', 'tipo_tramite:leer', 'tipo_tramite:editar', 'tipo_tramite:crear'] },
}
const tipo = { id: 1, nombre: 'Boleto de ornato', descripcion: 'Pago del boleto de ornato', monto: 25, activo: true,
  campos: [
    { clave: 'dpi', etiqueta: 'DPI (CUI) de 13 dígitos', tipoDato: 'TEXTO', obligatorio: true, patron: '^[0-9]{13}$', minimo: null, orden: 1 },
    { clave: 'ocupacion', etiqueta: 'Ocupación', tipoDato: 'TEXTO', obligatorio: true, patron: null, minimo: null, orden: 2 },
    { clave: 'ingreso_mensual', etiqueta: 'Ingreso mensual en quetzales', tipoDato: 'NUMERO', obligatorio: true, patron: null, minimo: 0, orden: 3 },
    { clave: 'direccion', etiqueta: 'Dirección de residencia', tipoDato: 'TEXTO', obligatorio: false, patron: null, minimo: null, orden: 4 },
  ], creadoEn: fecha, actualizadoEn: fecha }
function pagina(content) { return { content, page: { number: 0, size: 20, totalElements: content.length, totalPages: content.length ? 1 : 0 } } }
const roles = Object.entries(perfiles).map(([nombre, p], i) => ({ id: i + 1, nombre, descripcion: `Rol ${nombre.toLowerCase()}`, alcanceTotal: nombre !== 'CIUDADANO', permisos: p.permisos }))
const usuarios = Object.entries(perfiles).map(([rol, p]) => ({ ...p, correo: `${rol.toLowerCase()}@novagest.test`, roles: [rol], activo: true, bloqueado: false, creadoEn: fecha, actualizadoEn: fecha }))
usuarios.push({ ...usuarios[0], id: 8, nombre: 'Segundo Ciudadano Demo', correo: 'ciudadano2@novagest.test' })

async function capturar(nombre, rol, ruta, estado = 'POR_PAGAR', accion) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, locale: 'es-GT', timezoneId: 'America/Guatemala' })
  if (rol) await context.addInitScript(() => sessionStorage.setItem('novagest.renovacion', 'demo-no-valido'))
  const page = await context.newPage()
  const errores = []
  page.on('pageerror', (error) => errores.push(error.message))
  page.on('console', (mensaje) => { if (mensaje.type() === 'error') errores.push(mensaje.text()) })
  const tramite = { id: 12, tipoId: 1, tipoNombre: tipo.nombre, ciudadanoId: 7, gestorId: estado === 'BORRADOR' ? null : 3,
    estado, datos: { dpi: '1234567890101', ocupacion: 'Técnico', ingreso_mensual: 4500, direccion: 'Colonia Alamedas, Escuintla' },
    motivo: null, destinosPosibles: estado === 'BORRADOR' ? ['ENVIADO'] : [], creadoEn: fecha, actualizadoEn: fecha }
  const pago = { id: 5, tramiteId: 12, monto: 25, estado: estado === 'FINALIZADO' ? 'VALIDADO' : 'PENDIENTE',
    comprobanteTipo: 'application/pdf', comprobanteTamano: 1024, comprobanteHash: 'a'.repeat(64), creadoPor: 7,
    validadoPor: estado === 'FINALIZADO' ? 3 : null, validadoEn: estado === 'FINALIZADO' ? fecha : null, comentario: null, tramiteEstado: null, creadoEn: fecha }
  const historial = [{ id: 1, estadoAnterior: null, estadoNuevo: 'BORRADOR', actorId: 7, comentario: null, fecha },
    ...(estado !== 'BORRADOR' ? [{ id: 2, estadoAnterior: 'BORRADOR', estadoNuevo: 'ENVIADO', actorId: 7, comentario: null, fecha }] : []),
    ...(estado === 'FINALIZADO' ? [{ id: 3, estadoAnterior: 'POR_PAGAR', estadoNuevo: 'FINALIZADO', actorId: 3, comentario: 'Pago validado', fecha }] : [])]
  await page.route(`${base}/api/**`, async (route) => {
    const url = new URL(route.request().url())
    const p = url.pathname
    let data
    if (p === '/api/auth/refresh' || p === '/api/auth/login') data = { accessToken: 'demo-no-valido', refreshToken: 'demo-no-valido', tipo: 'Bearer', expiraEnSegundos: 900 }
    else if (p === '/api/usuarios/yo') data = { ...perfiles[rol], correo: `${rol.toLowerCase()}@novagest.test`, roles: [rol], alcanceTotal: rol !== 'CIUDADANO' }
    else if (p === '/api/usuarios') data = pagina(usuarios)
    else if (p === '/api/roles') data = roles
    else if (p === '/api/tipos-tramite/1') data = tipo
    else if (p === '/api/tipos-tramite') data = pagina([tipo])
    else if (p === '/api/tramites/12/historial') data = historial
    else if (p === '/api/tramites/12/transiciones') data = estado === 'BORRADOR' && rol === 'CIUDADANO' ? [{ accion: 'ENVIAR', estadoDestino: 'ENVIADO', comentarioObligatorio: false, ejecutable: true, motivo: null }] : []
    else if (p === '/api/tramites/12') data = tramite
    else if (p === '/api/tramites') data = pagina([tramite])
    else if (p === '/api/pagos') data = pagina([pago])
    else return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ status: 404, title: 'Ruta de demostración no disponible' }) })
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  })
  await page.route('**/actuator/health', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"UP"}' }))
  await page.goto(`${base}${ruta}`)
  try { await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 15000 }) }
  catch (error) { console.error({ errores, texto: (await page.locator('body').innerText()).slice(0, 1500) }); throw error }
  if (rol) await page.getByRole('button', { name: 'Cerrar sesión' }).waitFor()
  await page.waitForLoadState('networkidle')
  if (accion) await accion(page)
  if (errores.length) throw new Error(errores.join('\n'))
  if (await page.getByRole('alert').count()) throw new Error(`Aviso inesperado en ${nombre}`)
  await page.screenshot({ path: path.join(salida, `${nombre}.png`), fullPage: true })
  await context.close()
  console.log(`Capturada ${nombre}`)
}

try {
  await capturar('01-ingresar', null, '/ingresar')
  await capturar('02-ciudadano-tramites', 'CIUDADANO', '/tramites', 'BORRADOR')
  await capturar('03-ciudadano-borrador', 'CIUDADANO', '/tramites/12', 'BORRADOR')
  await capturar('04-ciudadano-pago', 'CIUDADANO', '/tramites/12')
  await capturar('05-gestor-pendientes', 'GESTOR', '/pagos')
  await capturar('06-gestor-confirmacion', 'GESTOR', '/pagos', 'POR_PAGAR', async (p) => { await p.getByRole('button', { name: 'Validar pago' }).click() })
  await capturar('07-auditor-detalle', 'AUDITOR', '/tramites/12', 'FINALIZADO')
  await capturar('08-administrador-usuarios', 'ADMINISTRADOR', '/usuarios')
  await capturar('09-administrador-roles', 'ADMINISTRADOR', '/roles')
} finally { await browser.close() }
