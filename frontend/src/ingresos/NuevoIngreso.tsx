import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { crearIngreso } from '../api/ingresos'
import { useTitulo } from '../componentes/useTitulo'
import { quetzales, soloFecha } from '../formato'
import FormularioIngreso from './FormularioIngreso'
import { formularioVacio } from './formulario'

export default function NuevoIngreso() {
  useTitulo('Nuevo ingreso')
  const navegar = useNavigate()
  const inicial = useMemo(() => formularioVacio(), [])
  return (
    <>
      <div className="encabezado-pagina">
        <h1>Nuevo ingreso</h1>
        <p>Registra un ingreso en quetzales. Solo tú puedes verlo.</p>
      </div>
      <FormularioIngreso
        inicial={inicial}
        textoGuardar="Registrar ingreso"
        onGuardar={async (solicitud) => {
          const creado = await crearIngreso(solicitud)
          void navegar('/ingresos', {
            state: {
              aviso: `Registramos el ingreso de ${quetzales(creado.montoGtq)} del ${soloFecha(creado.fecha)}.`,
            },
          })
        }}
      />
    </>
  )
}
