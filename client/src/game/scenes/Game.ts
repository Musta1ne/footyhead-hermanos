import Phaser, { Scene } from "phaser";
import { Peer } from "../peer";
import { Simulation, RULES, emptyInput, isInput, type Input, type Snapshot } from "../simulation";

const CONTROLS = "← / →: moverse · ↑: saltar · Espacio: patear";

export class Game extends Scene {
  private pin = "";
  private sim: Simulation;
  private peer: Peer;
  private keys: Record<string, Phaser.Input.Keyboard.Key>;
  private heads: Phaser.GameObjects.Image[];
  private boots: Phaser.GameObjects.Image[];
  private ball: Phaser.GameObjects.Image;
  private scoreText: Phaser.GameObjects.Text;
  private clockText: Phaser.GameObjects.Text;
  private replayButton: Phaser.GameObjects.Text;
  private confirmedFinished = false;
  private status: Phaser.GameObjects.Text;
  private pingText: Phaser.GameObjects.Text;
  private networkText: Phaser.GameObjects.Text;
  private local = emptyInput();
  private remote = emptyInput();
  private pending: Input[] = [];
  private remoteAt = 0;
  private accumulator = 0;
  private started = false;
  private remoteHidden = false;
  private lastSnapshot = -1;
  private confirmedRound = 0;
  private confirmedScore = [0, 0];
  private corrections = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];

  constructor() { super("Game"); }
  init(data: { pin: string }) { this.pin = data.pin.replaceAll("-", "").toUpperCase(); }

  create() {
    this.sim = new Simulation();
    this.keys = this.input.keyboard!.addKeys("UP, LEFT, RIGHT, SPACE") as typeof this.keys;
    this.add.image(512, 600, "ground").setScale(1.3, 1);
    this.add.image(25, 510, "goal");
    this.add.image(999, 513, "goal").setFlipX(true);
    this.heads = [1, 2].map(team => this.add.image(0, 0, `sprite-${team}`).setFlipX(team === 2));
    this.boots = [1, 2].map(team => this.add.image(0, 0, `boot-${team}`));
    this.ball = this.add.image(512, 400, "football");
    this.scoreText = this.add.text(512, 175, "0 : 0", { fontFamily: "Arial Black", fontSize: 64, stroke: "#000000", strokeThickness: 5 }).setOrigin(0.5);
    this.clockText = this.add.text(512, 240, "1:00", { fontFamily: "Arial Black", fontSize: 32, stroke: "#000000", strokeThickness: 4 }).setOrigin(0.5);
    this.replayButton = this.add.text(512, 315, "Jugar otra vez", { fontFamily: "Arial", fontSize: 26, backgroundColor: "#185c35", padding: { x: 24, y: 14 } }).setOrigin(0.5).setVisible(false).setInteractive({ useHandCursor: true });
    this.replayButton.on("pointerdown", () => {
      if (!this.peer.ready || !this.confirmedFinished) return;
      if (this.peer.host) this.rematch(1, this.sim.match);
      else this.peer.send({ type: "rematch", match: this.sim.match }, true);
    });
    this.status = this.add.text(512, 90, "Preparando conexión…", { fontFamily: "Arial", fontSize: "22px", align: "center", wordWrap: { width: 900 } }).setOrigin(0.5);
    this.pingText = this.add.text(512, 135, "", { fontFamily: "Arial", fontSize: "16px" }).setOrigin(0.5);
    this.networkText = this.add.text(512, 690, "", { fontFamily: "Arial", fontSize: "16px", align: "center", wordWrap: { width: 900 } }).setOrigin(0.5);
    this.add.text(512, 650, `Sala ${this.pin} · Mantené esta pestaña abierta durante la partida`, { fontFamily: "Arial", fontSize: "18px" }).setOrigin(0.5);
    this.peer = new Peer(this.pin, text => this.status.setText(text), text => {
      this.started = false; this.local.direction = 0; this.status.setText(text);
      this.replayButton.setVisible(false);
    });
    this.peer.onReady = () => {
      this.status.setText(CONTROLS);
      this.peer.send({ type: "visibility", hidden: document.hidden }, true);
      if (this.peer.host) {
        this.started = true;
        this.peer.send({ type: "state", state: this.sim.snapshot() }, true);
      }
    };
    this.peer.onMessage = message => this.receive(message);
    const release = () => { this.input.keyboard?.resetKeys(); this.local.direction = 0; };
    const visibility = () => {
      release(); this.accumulator = 0;
      this.peer.send({ type: "visibility", hidden: document.hidden }, true);
    };
    this.game.events.on("blur", release);
    document.addEventListener("visibilitychange", visibility);
    this.events.once("shutdown", () => {
      this.peer.close(); this.sim.destroy();
      this.game.events.off("blur", release);
      document.removeEventListener("visibilitychange", visibility);
    });
    this.renderBodies(0);
    void this.peer.connect();
  }

  private receive(message: Record<string, unknown>) {
    if (this.peer.host && message.type === "rematch" && Number.isSafeInteger(message.match)) {
      this.rematch(2, message.match as number);
    }
    if (message.type === "visibility" && typeof message.hidden === "boolean") {
      this.remoteHidden = message.hidden;
      this.remote.direction = 0; this.accumulator = 0;
    }
    if (this.peer.host && message.type === "input" && message.match === this.sim.match && !this.sim.finished && isInput(message.input)) {
      // El canal rápido puede entregar desordenado: nunca retroceder una orden.
      if (message.input.seq > this.remote.seq) { this.remote = message.input; this.remoteAt = performance.now(); }
    }
    if (!this.peer.host && message.type === "state" && isSnapshot(message.state)) {
      const state = message.state;
      if (state.tick <= this.lastSnapshot) return;
      this.lastSnapshot = state.tick;
      const newMatch = state.match !== this.sim.match;
      if (newMatch) this.resetMatchControls();
      this.confirmedFinished = state.remainingTicks === 0;
      const old = [...this.sim.players, this.sim.ball].map(body => ({ ...body.position }));
      const reset = newMatch || state.round !== this.confirmedRound || !this.started || (this.sim.pause > 0 && state.pause === 0);
      if (state.round > this.confirmedRound) this.sound.play("die");
      this.confirmedRound = state.round; this.confirmedScore = [...state.score];
      // Volver al estado confirmado y repetir las teclas aún no recibidas por el anfitrión.
      this.pending = this.pending.filter(input => input.seq > state.inputs[1].seq);
      this.sim.restore(state);
      for (const input of this.pending) this.sim.step(state.inputs[0], input);
      [...this.sim.players, this.sim.ball].forEach((body, i) => {
        const error = { x: old[i].x + this.corrections[i].x - body.position.x, y: old[i].y + this.corrections[i].y - body.position.y };
        this.corrections[i] = reset || Math.hypot(error.x, error.y) > 160 ? { x: 0, y: 0 } : error;
      });
      this.started = true;
    }
  }

  update(_time: number, delta: number) {
    if (!this.sim || !this.peer) return;
    const paused = document.hidden || this.remoteHidden;
    if (this.peer.ready && this.started) {
      const result = this.sim.winner === null ? "Empate" : `Ganó el jugador ${this.sim.winner === 1 ? "izquierdo" : "derecho"}`;
      this.status.setText(this.confirmedFinished ? `¡Terminó el partido! ${result}` : paused ? "Partida pausada: los dos deben volver a la pestaña del juego." : CONTROLS);
      this.pingText.setText(`Conexión ${this.peer.route}: ${this.peer.rtt ? Math.round(this.peer.rtt) + " ms" : "midiendo…"} · Jugás a la ${this.peer.host ? "izquierda" : "derecha"}`);
      this.networkText.setText(this.peer.route === "por servidor"
        ? `Respaldo HTTPS: puede tener mucha demora. ${this.peer.networkNote || "WebRTC no logró conectar."}`
        : this.peer.rtt > 200 ? "Demora alta: prueben cable de red y pausen las descargas en ambas casas." : "");
    }
    this.scoreText.setText(this.confirmedScore.join(" : "));
    const seconds = Math.ceil(this.sim.remainingTicks / 60);
    this.clockText.setText(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`);
    this.replayButton.setVisible(this.confirmedFinished && this.peer.ready);
    const ready = this.sim.ready[this.peer.host ? 0 : 1];
    this.replayButton.setText(ready ? "Esperando al otro jugador…" : this.sim.ready.some(Boolean) ? "Tu rival quiere revancha · Jugar otra vez" : "Jugar otra vez");
    this.replayButton.setAlpha(ready ? 0.7 : 1);
    if (this.confirmedFinished || this.sim.finished) { this.accumulator = 0; this.renderBodies(delta); return; }
    if (!this.started || !this.peer.ready || paused) { this.accumulator = 0; return; }
    const { UP, LEFT, RIGHT, SPACE } = this.keys;
    this.local.direction = LEFT.isDown ? -1 : RIGHT.isDown ? 1 : 0;
    if (Phaser.Input.Keyboard.JustDown(UP)) this.local.jump++;
    if (Phaser.Input.Keyboard.JustDown(SPACE)) this.local.kick++;
    this.accumulator += Math.min(delta, 100);
    while (this.accumulator >= RULES.stepMs) {
      this.accumulator -= RULES.stepMs;
      this.local.seq++;
      if (this.peer.host) {
        if (performance.now() - this.remoteAt > RULES.inputTimeoutMs) this.remote.direction = 0;
        const before = this.sim.round;
        this.sim.step(this.local, this.remote);
        if (this.sim.round > before) this.sound.play("die");
        this.confirmedScore = [...this.sim.score];
        this.confirmedFinished = this.sim.finished;
        if (this.sim.finished || this.sim.tick % RULES.snapshotEveryTicks === 0) this.peer.send({ type: "state", state: this.sim.snapshot() }, this.sim.finished);
      } else {
        const input = { ...this.local };
        this.pending.push(input);
        if (this.pending.length > 120) this.pending.shift();
        this.peer.send({ type: "input", match: this.sim.match, input });
        this.sim.step(this.sim.inputs[0], input);
      }
      if (this.sim.finished) { this.accumulator = 0; break; }
    }
    this.scoreText.setText(this.confirmedScore.join(" : "));
    this.renderBodies(delta);
  }

  private resetMatchControls() {
    this.local.direction = 0; this.remote.direction = 0;
    this.pending = []; this.accumulator = 0;
    this.input.keyboard?.resetKeys();
    this.corrections = this.corrections.map(() => ({ x: 0, y: 0 }));
  }

  private rematch(team: 1 | 2, match: number) {
    if (!this.sim.requestRematch(team, match)) return;
    if (!this.sim.finished) {
      this.resetMatchControls();
      this.confirmedScore = [...this.sim.score];
      this.confirmedFinished = false;
    }
    this.peer.send({ type: "state", state: this.sim.snapshot() }, true);
  }

  private renderBodies(delta: number) {
    const decay = Math.exp(-delta / 70);
    [...this.sim.players, this.sim.ball].forEach((body, i) => {
      this.corrections[i].x *= decay; this.corrections[i].y *= decay;
      const sprite = i === 2 ? this.ball : this.heads[i];
      sprite.setPosition(body.position.x + this.corrections[i].x, body.position.y + this.corrections[i].y);
      if (i === 2) sprite.setRotation(body.angle);
    });
    this.boots.forEach((boot, i) => {
      const age = this.sim.tick - this.sim.kicks[i];
      const swing = age >= 0 && age < 12 ? Math.sin(age / 12 * Math.PI) : 0;
      const side = i === 0 ? 1 : -1;
      boot.setPosition(this.heads[i].x + side * (-15 + swing * 40), this.heads[i].y + 25 - swing * 18);
      boot.setRotation(side * (-1.3 + swing * 1.8));
    });
  }
}

function isSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as Snapshot;
  const numbers = (a: unknown) => Array.isArray(a) && a.length === 2 && a.every(Number.isFinite);
  const body = (b: unknown) => !!b && typeof b === "object" && ["x", "y", "vx", "vy", "angle", "spin"].every(k => Number.isFinite((b as Record<string, unknown>)[k]));
  return Number.isSafeInteger(v.tick) && v.tick >= 0 && Number.isSafeInteger(v.round) && Number.isSafeInteger(v.pause)
    && Number.isSafeInteger(v.match) && v.match >= 0
    && Number.isSafeInteger(v.remainingTicks) && v.remainingTicks >= 0 && v.remainingTicks <= RULES.matchTicks
    && Array.isArray(v.ready) && v.ready.length === 2 && v.ready.every(b => typeof b === "boolean")
    && numbers(v.score) && numbers(v.kicks) && Array.isArray(v.inputs) && v.inputs.length === 2 && v.inputs.every(isInput)
    && Array.isArray(v.players) && v.players.length === 2 && v.players.every(body) && body(v.ball);
}
