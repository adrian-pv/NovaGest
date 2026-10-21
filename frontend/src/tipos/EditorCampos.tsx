import type { TipoDato } from '../api/tramites'
import Boton from '../componentes/Boton'
import Campo from '../componentes/Campo'
import Seleccion from '../componentes/Seleccion'
import {
  MAX_CAMPOS,
  TIPOS_DE_DATO,
  moverFila,
  nuevaFila,
  type ErroresTipo,
  type FilaCampo,
} from './formulario'

interface Props {
  campos: FilaCampo[]
  errores: ErroresTipo
  onCambio: (campos: FilaCampo[]) => void
}

/**
 * Editor de los campos que pide un tipo de trámite: se agregan, se reordenan con los botones (sin arrastrar, para que
 * también funcione con teclado) y se quitan. El patrón solo aparece en campos de texto y el mínimo solo en los de
 * número, igual que en la API.
 */
export default function EditorCampos({ campos, errores, onCambio }: Props) {
  function cambiar(uid: number, cambios: Partial<FilaCampo>) {
    onCambio(campos.map((c) => (c.uid === uid ? { ...c, ...cambios } : c)))
  }

  return (
    <section className="editor-campos" aria-labelledby="titulo-campos">
      <div className="encabezado-con-accion">
        <div>
          <h2 id="titulo-campos">Campos del trámite</h2>
          <p className="campo__ayuda">
            Lo que debe llenar quien inicia este trámite. La clave identifica el dato y no se
            muestra.
          </p>
        </div>
        <Boton
          variante="secundario"
          disabled={campos.length >= MAX_CAMPOS}
          onClick={() => onCambio([...campos, nuevaFila()])}
        >
          Agregar campo
        </Boton>
      </div>
      {errores.campos && <p className="campo__error">{errores.campos}</p>}
      {campos.length === 0 && (
        <p className="vacio">Este tipo no pide ningún dato. Agrega un campo si hace falta.</p>
      )}
      {campos.map((fila, i) => {
        const error = errores.filas[fila.uid] ?? {}
        return (
          <fieldset key={fila.uid} className="campo-tipo">
            <legend>Campo {i + 1}</legend>
            <Campo
              etiqueta="Clave"
              ayuda="Minúsculas, números y guion bajo. Por ejemplo: ingreso_mensual."
              error={error.clave}
              value={fila.clave}
              maxLength={50}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => cambiar(fila.uid, { clave: e.target.value })}
            />
            <Campo
              etiqueta="Etiqueta"
              error={error.etiqueta}
              value={fila.etiqueta}
              maxLength={100}
              onChange={(e) => cambiar(fila.uid, { etiqueta: e.target.value })}
            />
            <Seleccion
              etiqueta="Tipo de dato"
              error={error.tipoDato}
              opciones={TIPOS_DE_DATO}
              value={fila.tipoDato}
              onChange={(e) => cambiar(fila.uid, { tipoDato: e.target.value as TipoDato })}
            />
            {fila.tipoDato === 'TEXTO' && (
              <Campo
                etiqueta="Patrón (opcional)"
                ayuda="Expresión regular que debe cumplir el texto, por ejemplo ^[0-9]{13}$."
                error={error.patron}
                value={fila.patron}
                maxLength={200}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => cambiar(fila.uid, { patron: e.target.value })}
              />
            )}
            {fila.tipoDato === 'NUMERO' && (
              <Campo
                etiqueta="Mínimo (opcional)"
                error={error.minimo}
                inputMode="decimal"
                value={fila.minimo}
                onChange={(e) => cambiar(fila.uid, { minimo: e.target.value })}
              />
            )}
            <div className="campo campo--casilla">
              <label>
                <input
                  type="checkbox"
                  checked={fila.obligatorio}
                  onChange={(e) => cambiar(fila.uid, { obligatorio: e.target.checked })}
                />{' '}
                Obligatorio para enviar el trámite
              </label>
            </div>
            <div className="acciones-formulario">
              <Boton
                variante="secundario"
                disabled={i === 0}
                aria-label={`Subir el campo ${i + 1}`}
                onClick={() => onCambio(moverFila(campos, i, -1))}
              >
                Subir
              </Boton>
              <Boton
                variante="secundario"
                disabled={i === campos.length - 1}
                aria-label={`Bajar el campo ${i + 1}`}
                onClick={() => onCambio(moverFila(campos, i, 1))}
              >
                Bajar
              </Boton>
              <Boton
                variante="peligro"
                aria-label={`Quitar el campo ${i + 1}`}
                onClick={() => onCambio(campos.filter((c) => c.uid !== fila.uid))}
              >
                Quitar
              </Boton>
            </div>
          </fieldset>
        )
      })}
    </section>
  )
}
