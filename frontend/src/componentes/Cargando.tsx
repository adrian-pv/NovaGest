export default function Cargando({ texto = 'Cargando...' }: { texto?: string }) {
  return (
    <p className="cargando" role="status">
      <span className="cargando__giro" aria-hidden="true" />
      {texto}
    </p>
  )
}
