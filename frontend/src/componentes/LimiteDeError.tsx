import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface Estado {
  fallo: boolean
}

/**
 * Última red de seguridad: si una pantalla falla al dibujarse por un error del código, la persona ve esta página
 * en vez de una pantalla en blanco o un mensaje técnico. No muestra ni registra el detalle del error.
 */
export default class LimiteDeError extends Component<Props, Estado> {
  state: Estado = { fallo: false }

  static getDerivedStateFromError(): Estado {
    return { fallo: true }
  }

  render() {
    if (!this.state.fallo) return this.props.children
    return (
      <div className="pagina-error" role="alert">
        <h1>Algo salió mal</h1>
        <p>Ocurrió un error inesperado en la aplicación. Recarga la página para continuar.</p>
        <button type="button" className="boton boton--primario" onClick={() => location.reload()}>
          Recargar la página
        </button>
      </div>
    )
  }
}
