import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MenuShell } from "../layout/MenuShell";
import {
  assignControlBinding,
  CONTROL_ACTIONS,
  controlKeyLabel,
  DEFAULT_CONTROL_BINDINGS,
  getControlBindings,
  saveControlBindings,
  type ControlAction,
  type ControlBindings,
} from "../game/control-bindings";

const ACTION_LABELS: Record<ControlAction, string> = {
  left: "Mover a la izquierda",
  right: "Mover a la derecha",
  jump: "Saltar",
  kick: "Patear",
};

export default function Controls() {
  const [draft, setDraft] = useState<ControlBindings>(() => getControlBindings());
  const [listening, setListening] = useState<ControlAction | null>(null);
  const [status, setStatus] = useState("Elegí Cambiar para asignar otra tecla.");

  useEffect(() => {
    if (!listening) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === "Escape") {
        setListening(null);
        setStatus("Cambio cancelado.");
        return;
      }
      const result = assignControlBinding(draft, listening, event.code);
      if (!result.ok) {
        if (result.reason === "conflict" && result.conflict) {
          setStatus(`Esa tecla ya está asignada a ${ACTION_LABELS[result.conflict]}. Elegí otra.`);
        } else {
          setStatus("Esa tecla no se puede usar. Probá con otra.");
        }
        return;
      }
      setDraft(result.bindings);
      setListening(null);
      setStatus(`${ACTION_LABELS[listening]} ahora usa ${controlKeyLabel(event.code)}.`);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [draft, listening]);

  const save = () => {
    setListening(null);
    setStatus(saveControlBindings(draft)
      ? "Controles guardados. Se aplicarán al entrar a la próxima partida."
      : "No se pudieron guardar los controles en este navegador.");
  };

  const reset = () => {
    const defaults = { ...DEFAULT_CONTROL_BINDINGS };
    setDraft(defaults);
    setListening(null);
    setStatus(saveControlBindings(defaults)
      ? "Controles restablecidos y guardados."
      : "Controles restablecidos para esta visita, pero no se pudieron guardar.");
  };

  return (
    <MenuShell>
      <section className="arcade-panel arcade-controls-panel" aria-labelledby="controls-title">
        <p className="arcade-eyebrow">CONFIGURACIÓN DE LA PARTIDA</p>
        <h2 id="controls-title">Personalizar controles</h2>
        <p className="arcade-intro">Elegí una tecla distinta para cada acción. Los cambios quedan guardados en este navegador.</p>
        <div className="arcade-bindings" aria-label="Teclas de juego">
          {CONTROL_ACTIONS.map(action => (
            <div className="arcade-binding-row" key={action}>
              <span id={`binding-label-${action}`}>{ACTION_LABELS[action]}</span>
              <span className="arcade-key" aria-live="polite">{controlKeyLabel(draft[action])}</span>
              <button
                type="button"
                className="arcade-button arcade-button--small"
                aria-describedby={`binding-label-${action}`}
                aria-pressed={listening === action}
                onClick={() => {
                  setListening(listening === action ? null : action);
                  setStatus(listening === action ? "Cambio cancelado." : `Presioná una tecla para ${ACTION_LABELS[action]}. Escape cancela.`);
                }}
              >
                {listening === action ? "Esperando…" : "Cambiar"}
              </button>
            </div>
          ))}
        </div>
        <p className="arcade-controls-status" role="status" aria-live="polite">{status}</p>
        <div className="arcade-actions arcade-controls-actions">
          <button type="button" className="arcade-button arcade-button--gold" onClick={save}>Guardar controles</button>
          <button type="button" className="arcade-button" onClick={reset}>Restablecer predeterminadas</button>
        </div>
      </section>
      <Link to="/" className="arcade-back">← Cancelar y volver al menú</Link>
    </MenuShell>
  );
}
