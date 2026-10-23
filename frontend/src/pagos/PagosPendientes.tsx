import { Link, useSearchParams } from 'react-router-dom'
import { listarPagosPendientes, descargarComprobante, type Pago } from '../api/pagos'
import { useDatos } from '../componentes/useDatos'
import { useTitulo } from '../componentes/useTitulo'
import TablaPaginada, { type Columna } from '../componentes/TablaPaginada'
import Boton from '../componentes/Boton'
import AvisoError from '../componentes/AvisoError'
import { guardarArchivo } from '../descarga'
import { fechaHora, quetzales } from '../formato'
import { useState } from 'react'
import ResolverPago from './ResolverPago'

export default function PagosPendientes() {
  useTitulo('Pagos pendientes')
  const [params, setParams] = useSearchParams()
  const page = Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0)
  const pagos = useDatos(String(page), (senal) => listarPagosPendientes(page, senal))
  const columnas: Columna<Pago>[] = [
    { clave: 'id', encabezado: 'Pago', celda: (p) => `#${p.id}` },
    {
      clave: 'tramite',
      encabezado: 'Trámite',
      celda: (p) => <Link to={`/tramites/${p.tramiteId}`}>Ver trámite #{p.tramiteId}</Link>,
    },
    { clave: 'fecha', encabezado: 'Recibido', celda: (p) => fechaHora(p.creadoEn) },
    { clave: 'monto', encabezado: 'Monto', celda: (p) => quetzales(p.monto), derecha: true },
    {
      clave: 'acciones',
      encabezado: 'Revisión',
      celda: (p) => <Revision pago={p} alResolver={pagos.recargar} />,
    },
  ]
  return (
    <>
      <div className="encabezado-pagina">
        <h1>Pagos pendientes</h1>
        <p>Revisa los comprobantes más antiguos primero. Validar un pago finaliza el trámite.</p>
      </div>
      <Boton variante="secundario" onClick={pagos.recargar} disabled={pagos.cargando}>
        Actualizar lista
      </Boton>
      <TablaPaginada
        titulo="Pagos pendientes de validación"
        columnas={columnas}
        pagina={pagos.datos}
        cargando={pagos.cargando}
        error={pagos.error}
        onReintentar={pagos.recargar}
        onCambiarPagina={(n) => setParams(n ? { page: String(n) } : {})}
        idFila={(p) => p.id}
        mensajeVacio="No hay pagos pendientes en esta página."
      />
      {page > 0 && (
        <Boton variante="secundario" onClick={() => setParams({})}>
          Volver a la primera página
        </Boton>
      )}
    </>
  )
}

function Revision({ pago, alResolver }: { pago: Pago; alResolver: () => void }) {
  const [descargando, setDescargando] = useState(false)
  const [error, setError] = useState<unknown>(null)
  async function descargar() {
    setDescargando(true)
    setError(null)
    try {
      const archivo = await descargarComprobante(pago.id)
      guardarArchivo(archivo.contenido, archivo.nombre, `comprobante-${pago.id}`)
    } catch (fallo) {
      setError(fallo)
    } finally {
      setDescargando(false)
    }
  }
  return (
    <>
      <Boton
        variante="secundario"
        aria-label={`Descargar el comprobante del pago ${pago.id}`}
        cargando={descargando}
        textoCargando="Descargando..."
        onClick={() => void descargar()}
      >
        Descargar comprobante
      </Boton>
      {Boolean(error) && <AvisoError error={error} />}
      <ResolverPago pago={pago} alResolver={alResolver} />
    </>
  )
}
