import type { CampoTipo } from '../api/tramites'
import Campo from '../componentes/Campo'
import type { Valores } from './datos'

interface Props {
  campos: CampoTipo[]
  valores: Valores
  /** Motivo de error por clave de campo (de la validación local o de la API). */
  errores: Record<string, string>
  onCambio: (clave: string, valor: string | boolean) => void
}

function ayudaDe(campo: CampoTipo): string {
  const partes = [campo.obligatorio ? 'Obligatorio para enviar el trámite.' : 'Opcional.']
  if (campo.tipoDato === 'NUMERO' && campo.minimo !== null) partes.push(`Mínimo ${campo.minimo}.`)
  return partes.join(' ')
}

/**
 * Formulario que se arma solo con los campos que declara el tipo de trámite. Un borrador puede guardarse
 * incompleto, por eso ningún campo bloquea el guardado: la API avisa qué falta al enviar.
 */
export default function FormularioDatos({ campos, valores, errores, onCambio }: Props) {
  const ordenados = [...campos].sort((a, b) => a.orden - b.orden)
  return (
    <>
      {ordenados.map((campo) => {
        const valor = valores[campo.clave]
        if (campo.tipoDato === 'BOOLEANO') {
          return (
            <div key={campo.clave} className="campo campo--casilla">
              <label>
                <input
                  type="checkbox"
                  checked={valor === true}
                  onChange={(e) => onCambio(campo.clave, e.target.checked)}
                />{' '}
                {campo.etiqueta}
              </label>
              {errores[campo.clave] && <p className="campo__error">{errores[campo.clave]}</p>}
            </div>
          )
        }
        return (
          <Campo
            key={campo.clave}
            etiqueta={campo.etiqueta}
            ayuda={ayudaDe(campo)}
            error={errores[campo.clave]}
            type={campo.tipoDato === 'FECHA' ? 'date' : 'text'}
            inputMode={campo.tipoDato === 'NUMERO' ? 'decimal' : undefined}
            value={typeof valor === 'string' ? valor : ''}
            onChange={(e) => onCambio(campo.clave, e.target.value)}
          />
        )
      })}
    </>
  )
}
