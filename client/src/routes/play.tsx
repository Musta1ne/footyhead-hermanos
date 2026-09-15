import { Form, Link, useActionData, useNavigation } from "react-router-dom";
import { CopyToClipboard } from "react-copy-to-clipboard";
import { useState } from "react";
import { MenuShell } from "../layout/MenuShell";
import type { MatchMode } from "../game/match-mode";

const prettyPrint = (str: string) => `${str.slice(0, 5)}-${str.slice(5)}`;
const modes: { id: MatchMode; title: string; description: string }[] = [
  { id: "timed", title: "Con tiempo", description: "1 minuto · Al llegar a 0, el próximo gol gana" },
  { id: "first-to-seven", title: "First to seven", description: "El primero en marcar 7 goles gana" },
  { id: "practice", title: "Practice", description: "Juego libre, sin reloj ni límite de goles" },
];

export default function Play() {
  const [copied, setCopied] = useState(false);
  const { pin, mode } = (useActionData() as { pin: string; mode: MatchMode }) || {};
  const busy = useNavigation().state !== "idle";

  return (
    <MenuShell>
      <section className="arcade-panel" aria-labelledby="room-title">
        <p className="arcade-eyebrow">PARTIDA ONLINE · 1 VS 1</p>
        <h2 id="room-title">{pin ? "¡Sala lista!" : "Creá tu sala"}</h2>
        <p className="arcade-intro">{pin ? "Pasale el enlace a tu rival. Nos vemos en la cancha." : "Elegí cómo se define la partida y después invitá a tu rival."}</p>
        {pin ? (
          <p className="arcade-selected-mode">MODO DE JUEGO <strong>{modes.find(item => item.id === mode)?.title}</strong></p>
        ) : null}
        <div className="arcade-room-code" aria-live="polite">
          <span>CÓDIGO DE SALA</span>
          <strong>{pin ? prettyPrint(pin) : "— — — — —"}</strong>
          {!pin && <small>Se genera al crear la sala</small>}
        </div>
        {pin ? (
          <div className="arcade-actions">
            <CopyToClipboard text={`${window.location.origin}/play/${pin}`} onCopy={(_, success) => setCopied(success)}>
              <button type="button" className="arcade-button">{copied ? "¡Enlace copiado!" : "Copiar enlace"}</button>
            </CopyToClipboard>
            <Link to={pin} className="arcade-button arcade-button--gold">Entrar a jugar</Link>
          </div>
        ) : (
          <Form method="post" className="arcade-actions">
            <fieldset className="arcade-mode-picker">
              <legend>Elegí el modo de juego</legend>
              {modes.map(item => (
                <label className="arcade-mode-option" key={item.id}>
                  <input type="radio" name="mode" value={item.id} defaultChecked={item.id === "timed"} />
                  <span className="arcade-mode-arrow" aria-hidden="true">▶</span>
                  <span className="arcade-mode-copy"><strong>{item.title}</strong><small>{item.description}</small></span>
                </label>
              ))}
            </fieldset>
            <button type="submit" className="arcade-button arcade-button--gold" disabled={busy}>{busy ? "Creando sala…" : "Crear sala"}</button>
          </Form>
        )}
        <p className="arcade-room-help">Vos jugás a la izquierda; tu invitado, a la derecha. Usá el mismo navegador donde creaste la sala y mantené una sola pestaña del juego abierta.</p>
      </section>
      <Link to="/" className="arcade-back">← Volver al menú</Link>
    </MenuShell>
  );
}
