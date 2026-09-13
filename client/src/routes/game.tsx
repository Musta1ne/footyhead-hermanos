import { useRef, useState } from "react";
import { IRefPhaserGame, PhaserGame } from "../game/PhaserGame";
import { Link, useLoaderData, useParams } from "react-router-dom";
import { EventBus } from "../game/EventBus";
import "../layout/game.css";

export function Game() {
  //  References to the PhaserGame component (game and scene are exposed)
  const phaserRef = useRef<IRefPhaserGame | null>(null);
  const [muted, setMuted] = useState(false);
  const { pin } = useParams();
  const { roomId } = useLoaderData() as { roomId: string };

  const onCurrentActiveScene = (scene: Phaser.Scene) => {
    if (scene.scene.key == "Preloader") {
      EventBus.emit("room-ready", { pin, roomId });
    }
  };

  return (
    <main className="game-page">
      <div className="game-cabinet">
        <header className="game-toolbar">
          <h1>FOOTY HEAD <span>HERMANOS</span></h1>
          <nav aria-label="Opciones de la partida">
            <button type="button" className="game-menu-button" aria-pressed={muted} aria-label="Silenciar sonido" onClick={() => {
              const next = !muted;
              if (phaserRef.current?.game) phaserRef.current.game.sound.mute = next;
              setMuted(next);
            }}>{muted ? "Sonido: no" : "Sonido: sí"}</button>
            <Link to="/play" className="game-menu-button" aria-label="Salir y crear otra partida">← Menú</Link>
          </nav>
        </header>
        <div className="game-screen" aria-label="Cancha de fútbol para dos jugadores">
          <PhaserGame ref={phaserRef} currentActiveScene={onCurrentActiveScene} />
        </div>
        <footer className="game-room-strip">
          <span>SALA <strong>{pin}</strong></span>
          <span>La partida se pausa si alguno cambia de pestaña.</span>
        </footer>
      </div>
    </main>
  );
}

export default Game;
