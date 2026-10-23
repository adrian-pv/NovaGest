import { Route, Routes } from 'react-router-dom'
import Diseno from './componentes/Diseno'
import EditarIngreso from './ingresos/EditarIngreso'
import ListaIngresos from './ingresos/ListaIngresos'
import NuevoIngreso from './ingresos/NuevoIngreso'
import Proyeccion from './ingresos/Proyeccion'
import TipoCambio from './ingresos/TipoCambio'
import Ingresar from './paginas/Ingresar'
import Inicio from './paginas/Inicio'
import NoEncontrado from './paginas/NoEncontrado'
import Panel from './paginas/Panel'
import Registro from './paginas/Registro'
import RutaProtegida from './sesion/RutaProtegida'
import Bandeja from './tramites/Bandeja'
import DetalleTramite from './tramites/DetalleTramite'
import EditarTramite from './tramites/EditarTramite'
import ListaTramites from './tramites/ListaTramites'
import NuevoTramite from './tramites/NuevoTramite'
import EditarTipo from './tipos/EditarTipo'
import ListaTipos from './tipos/ListaTipos'
import NuevoTipo from './tipos/NuevoTipo'
import EditarUsuario from './usuarios/EditarUsuario'
import ListaRoles from './usuarios/ListaRoles'
import ListaUsuarios from './usuarios/ListaUsuarios'
import NuevoUsuario from './usuarios/NuevoUsuario'

/**
 * Rutas de la aplicación. Todas se dibujan dentro del marco común (Diseno). Las que exigen sesión van dentro de
 * RutaProtegida; para exigir además un permiso: <Route element={<RutaProtegida permiso="tramite:leer" />}>.
 * Al agregar una pantalla, agrega también su enlace en src/sesion/navegacion.ts.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<Diseno />}>
        <Route path="/" element={<Inicio />} />
        <Route path="/ingresar" element={<Ingresar />} />
        <Route path="/registro" element={<Registro />} />
        <Route element={<RutaProtegida />}>
          <Route path="/panel" element={<Panel />} />
        </Route>
        <Route element={<RutaProtegida permiso="tramite:leer" alcanceTotal />}>
          <Route path="/bandeja" element={<Bandeja />} />
        </Route>
        <Route element={<RutaProtegida permiso="tramite:leer" />}>
          <Route path="/tramites" element={<ListaTramites />} />
          <Route path="/tramites/:id" element={<DetalleTramite />} />
        </Route>
        <Route element={<RutaProtegida permiso="tramite:crear" />}>
          <Route path="/tramites/nuevo" element={<NuevoTramite />} />
        </Route>
        <Route element={<RutaProtegida permiso="tramite:editar" />}>
          <Route path="/tramites/:id/editar" element={<EditarTramite />} />
        </Route>
        <Route element={<RutaProtegida permiso="ingreso:leer" />}>
          <Route path="/ingresos" element={<ListaIngresos />} />
          <Route path="/ingresos/proyeccion" element={<Proyeccion />} />
          <Route path="/divisas" element={<TipoCambio />} />
        </Route>
        <Route element={<RutaProtegida permiso="ingreso:crear" />}>
          <Route path="/ingresos/nuevo" element={<NuevoIngreso />} />
        </Route>
        <Route element={<RutaProtegida permiso="ingreso:editar" />}>
          <Route path="/ingresos/:id/editar" element={<EditarIngreso />} />
        </Route>
        <Route element={<RutaProtegida permiso="tipo_tramite:editar" />}>
          <Route path="/tipos" element={<ListaTipos />} />
          <Route path="/tipos/:id/editar" element={<EditarTipo />} />
        </Route>
        <Route element={<RutaProtegida permiso="tipo_tramite:crear" />}>
          <Route path="/tipos/nuevo" element={<NuevoTipo />} />
        </Route>
        <Route element={<RutaProtegida permiso="usuario:leer" />}>
          <Route path="/usuarios" element={<ListaUsuarios />} />
        </Route>
        <Route element={<RutaProtegida permiso="usuario:crear" />}>
          <Route path="/usuarios/nuevo" element={<NuevoUsuario />} />
        </Route>
        <Route element={<RutaProtegida permiso="usuario:editar" />}>
          <Route path="/usuarios/:id/editar" element={<EditarUsuario />} />
        </Route>
        <Route element={<RutaProtegida permiso="rol:leer" />}>
          <Route path="/roles" element={<ListaRoles />} />
        </Route>
        <Route path="*" element={<NoEncontrado />} />
      </Route>
    </Routes>
  )
}
