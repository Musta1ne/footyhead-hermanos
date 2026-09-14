import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MenuShell } from "../layout/MenuShell";
import {
  CONTROL_ACTIONS,
  formatKey,
  loadKeyBindings,
  saveKeyBindings,
  subscribeKeyBindings,
  type ControlAction,
  type KeyBindings,
  resetKeyBindings,
  isValidKeyCode,
} from "../game/keys";

const ACTION_LABELS: Record<ControlAction, { title: string; description: string }> = {
  left: { title: "Mover a la izquierda", description: "Corré hacia el arco izquierdo." },
  right: { title: "Mover a la derecha", description: "Corré hacia el arco derecho." },
  jump: { title: "Saltar", description: "Levantá la cabeza para disputar la pelota." },
  kick: { title: "Patear", description: "Activá la bota para pegarle a la pelota." },
};

export default function Controls() {
  const [bindings, setBindings] = useState<KeyBindings>(() => loadKeyBindings());
  const [capturing, setCapturing] = useState<ControlAction | null>(null);
  const [message, setMessage] = useState("Tus cambios se guardan en este navegador.");

  useEffect(() => subscribeKeyBindings(setBindings), []);

  useEffect(() => {
    if (!capturing) return undefined;
    const captureKey = (event: KeyboardEvent) => {
      if (event.code === "Tab" || event.ctrlKey || event.altKey || event.metaKey) return;
      event.preventDefault();
      if (event.code === "Escape") {
        setCapturing(null);
        setMessage("Cambio cancelado.");
        return;
      }
      if (!isValidKeyCode(event.code)) {
        setMessage("Esa tecla no se puede usar. Elegí una flecha, letra, número o Espacio.");
        return;
      }
      const conflict = CONTROL_ACTIONS.find(action => action !== capturing && bindings[action] === event.code);
      if (conflict) {
        setMessage(`La tecla ${formatKey(event.code)} ya está asignada a ${ACTION_LABELS[conflict].title.toLowerCase()}.`);
        return;
      }
      const next = saveKeyBindings({ ...bindings, [capturing]: event.code });
      setBindings(next);
      setCapturing(null);
      setMessage(`${ACTION_LABELS[capturing].title}: ${formatKey(next[capturing])}.`);
    };
    window.addEventListener("keydown", captureKey);
    return () => window.removeEventListener("keydown", captureKey);
  }, [bindings, capturing]);

  const restoreDefaults = () => {
    const next = resetKeyBindings();
    setBindings(next);
    setCapturing(null);
    setMessage("Volvimos a las teclas originales.");
  };

  return (
    <MenuShell>
      <section className="arcade-panel arcade-controls" aria-labelledby="controls-title">
        <p className="arcade-eyebrow">CONFIGURACIÓN DE LA PARTIDA</p>
        <h2 id="controls-title">Personalizá tus teclas</h2>
        <p className="arcade-intro">
          Elegí una tecla para cada acción. La configuración queda guardada en este navegador y también se usa dentro de la cancha.
        </p>
        <div className="arcade-controls-list" role="group" aria-label="Asignaciones de teclas">
          {CONTROL_ACTIONS.map(action => {
            const definition = ACTION_LABELS[action];
            const isCapturing = capturing === action;
            return (
              <div className="arcade-control-row" key={action}>
                <div className="arcade-control-copy">
                  <strong>{definition.title}</strong>
                  <small>{definition.description}</small>
                </div>
                <button
                  type="button"
                  className={`arcade-key-button${isCapturing ? " arcade-key-button--active" : ""}`}
                  aria-label={`Cambiar tecla para ${definition.title}`}
                  aria-pressed={isCapturing}
                  onClick={() => {
                    setCapturing(action);
                    setMessage(`Presioná una tecla para ${definition.title.toLowerCase()}. Escape cancela.`);
                  }}
                >
                  {isCapturing ? "Presioná una tecla…" : formatKey(bindings[action])}
                </button>
              </div>
            );
          })}
        </div>
        <p className="arcade-controls-message" role="status" aria-live="polite">{message}</p>
        <div className="arcade-controls-actions">
          <button type="button" className="arcade-button" onClick={restoreDefaults}>
            Restaurar valores por defecto
          </button>
          <Link to="/" className="arcade-back">← Volver al menú</Link>
        </div>
        <p className="arcade-controls-help">
          No podés repetir una tecla en dos acciones. Las teclas de navegación se conservan para que el menú siga siendo accesible.
        </p>
      </section>
    </MenuShell>
  );
}
