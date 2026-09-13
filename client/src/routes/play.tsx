import { Form, Link, useActionData, useNavigation } from "react-router-dom";
import { CopyToClipboard } from "react-copy-to-clipboard";
import { useState } from "react";
import { MenuShell } from "../layout/MenuShell";

const prettyPrint = (str: string) => `${str.slice(0, 5)}-${str.slice(5)}`;

export default function Play() {
  const [copied, setCopied] = useState(false);
  const { pin } = (useActionData() as { pin: string; roomID: string }) || {};
  const busy = useNavigation().state !== "idle";

  return (
    <MenuShell>
      <section className="arcade-panel" aria-labelledby="room-title">
        <p className="arcade-eyebrow">PARTIDA ONLINE · 1 VS 1</p>
        <h2 id="room-title">{pin ? "¡Sala lista!" : "Creá tu sala"}</h2>
        <p className="arcade-intro">{pin ? "Pasale el enlace a tu rival. Nos vemos en la cancha." : "El próximo clásico empieza acá. Invitá a alguien y disputen el partido."}</p>
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
            <button type="submit" className="arcade-button arcade-button--gold" disabled={busy}>{busy ? "Creando sala…" : "Crear sala"}</button>
          </Form>
        )}
        <p className="arcade-room-help">Vos jugás a la izquierda; tu invitado, a la derecha. Usá el mismo navegador donde creaste la sala y mantené una sola pestaña del juego abierta.</p>
      </section>
      <Link to="/" className="arcade-back">← Volver al menú</Link>
    </MenuShell>
  );
}
