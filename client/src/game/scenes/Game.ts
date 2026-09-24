import Phaser, { Scene } from "phaser";
import { Peer } from "../peer";
import { ARCADE_FONT, drawGoal, drawStadium, renderGoal } from "./stadium";
import { Simulation, RULES, emptyInput, isInput, type Input, type Snapshot } from "../simulation";
import { controlKeyCode, getControlBindings, type ControlBindings } from "../control-bindings";
import { VISUALS } from "../visual-proportions";
import { isMatchMode, type MatchMode } from "../match-mode";
import { POWERUP_DISPLAY, POWERUP_RULES, effectGroup, isPowerupType, seedFromRoom } from "../powerups";

export class Game extends Scene {
  private pin = "";
  private mode: MatchMode = "timed";
  private sim: Simulation;
  private peer: Peer;
  private keys: Record<"left" | "right" | "jump" | "kick", Phaser.Input.Keyboard.Key>;
  private bindings: ControlBindings;
  private heads: Phaser.GameObjects.Image[];
  private boots: Phaser.GameObjects.Image[];
  private ball: Phaser.GameObjects.Image;
  private goals: [Phaser.GameObjects.Graphics, Phaser.GameObjects.Graphics];
  private drawnGoalScales: [number, number] = [1, 1];
  private powerupSprites = new Map<number, { star: Phaser.GameObjects.Star; icon: Phaser.GameObjects.Text; label: Phaser.GameObjects.Text }>();
  private effectBadges = new Map<string, Phaser.GameObjects.Text>();
  private scoreText: Phaser.GameObjects.Text;
  private cornerScores: Phaser.GameObjects.Text[];
  private goalText: Phaser.GameObjects.Text;
  private replayPanel: Phaser.GameObjects.Graphics;
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
  init(data: { pin: string; mode: MatchMode }) {
    this.pin = data.pin.replaceAll("-", "").toUpperCase();
    this.mode = isMatchMode(data.mode) ? data.mode : "timed";
  }

  create() {
    this.sim = new Simulation(this.mode, seedFromRoom(this.pin));
    this.powerupSprites.clear();
    this.effectBadges.clear();
    this.drawnGoalScales = [1, 1];
    this.bindings = getControlBindings();
    this.keys = {
      left: this.input.keyboard!.addKey(controlKeyCode(this.bindings.left)!),
      right: this.input.keyboard!.addKey(controlKeyCode(this.bindings.right)!),
      jump: this.input.keyboard!.addKey(controlKeyCode(this.bindings.jump)!),
      kick: this.input.keyboard!.addKey(controlKeyCode(this.bindings.kick)!),
    };
    drawStadium(this, this.mode);
    this.goals = [drawGoal(this, false), drawGoal(this, true)];
    this.heads = [1, 2].map(team => this.add.image(0, 0, `sprite-${team}`).setDisplaySize(VISUALS.player.width, VISUALS.player.height).setFlipX(team === 2));
    this.boots = [1, 2].map(team => this.add.image(0, 0, `boot-${team}`).setDisplaySize(VISUALS.boot.width, VISUALS.boot.height));
    this.ball = this.add.image(512, RULES.serveY, "football").setDisplaySize(VISUALS.ball.width, VISUALS.ball.height);
    const scoreStyle = { fontFamily: ARCADE_FONT, fontSize: 60, color: "#245e27", stroke: "#fffbe7", strokeThickness: 5, shadow: { offsetX: 2, offsetY: 3, color: "#263b2a", blur: 4, fill: true } };
    this.scoreText = this.add.text(512, 207, "0 : 0", scoreStyle).setOrigin(0.5);
    this.cornerScores = [this.add.text(22, 56, "0", { ...scoreStyle, fontSize: 44, color: "#fffbe7", stroke: "#17211d", strokeThickness: 2 }), this.add.text(1002, 56, "0", { ...scoreStyle, fontSize: 44, color: "#fffbe7", stroke: "#17211d", strokeThickness: 2 }).setOrigin(1, 0)];
    this.clockText = this.add.text(512, 28, "1:00", { ...scoreStyle, fontSize: 30, strokeThickness: 3 }).setOrigin(0.5);
    this.goalText = this.add.text(512, 275, "¡GOL!", { ...scoreStyle, fontSize: 42, color: "#ffe52b", stroke: "#2c4325" }).setOrigin(0.5).setVisible(false);
    this.replayPanel = this.add.graphics().setVisible(false);
    this.replayPanel.fillStyle(0x34482c).fillRoundedRect(212, 304, 600, 62, 12);
    this.replayPanel.fillStyle(0xc8cdc0).fillRoundedRect(212, 300, 600, 60, 12);
    this.replayPanel.lineStyle(3, 0xfffced).strokeRoundedRect(212, 300, 600, 60, 12);
    this.replayButton = this.add.text(512, 330, "Jugar otra vez", { fontFamily: ARCADE_FONT, fontSize: 26, color: "#215c2a", padding: { x: 20, y: 12 } }).setOrigin(0.5).setVisible(false).setInteractive({ useHandCursor: true });
    this.replayButton.on("pointerover", () => this.replayButton.setColor("#44802b"));
    this.replayButton.on("pointerout", () => this.replayButton.setColor("#215c2a"));
    this.replayButton.on("pointerdown", () => {
      if (!this.peer.ready || !this.confirmedFinished) return;
      if (this.peer.host) this.rematch(1, this.sim.match);
      else this.peer.send({ type: "rematch", match: this.sim.match }, true);
    });
    this.status = this.add.text(512, 115, "Preparando conexión…", { fontFamily: "Arial", fontSize: "20px", color: "#23472d", backgroundColor: "#e7edda", padding: { x: 16, y: 10 }, align: "center", wordWrap: { width: 680 } }).setOrigin(0.5);
    this.pingText = this.add.text(512, 712, "Esperando al otro jugador…", { fontFamily: "Arial", fontSize: "16px", color: "#eef0da" }).setOrigin(0.5);
    this.networkText = this.add.text(512, 742, "", { fontFamily: "Arial", fontSize: "14px", color: "#ffe6a2", align: "center", wordWrap: { width: 960 } }).setOrigin(0.5);
    this.peer = new Peer(this.pin, text => this.status.setText(text).setVisible(true), text => {
      this.started = false; this.releaseControls(this.local); this.status.setText(text).setVisible(true);
      this.replayButton.setVisible(false);
      this.replayPanel.setVisible(false);
    });
    this.peer.onReady = () => {
      this.status.setVisible(false);
      this.peer.send({ type: "visibility", hidden: document.hidden }, true);
      if (this.peer.host) {
        this.started = true;
        this.peer.send({ type: "state", state: this.sim.snapshot() }, true);
      }
    };
    this.peer.onMessage = message => this.receive(message);
    const release = () => { this.input.keyboard?.resetKeys(); this.releaseControls(this.local); };
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
      this.releaseControls(this.remote); this.accumulator = 0;
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
      this.confirmedFinished = state.winner !== null;
      const old = [...this.sim.players, this.sim.ball].map(body => ({ ...body.position }));
      const reset = newMatch || state.round !== this.confirmedRound || !this.started
        || (this.sim.pause > 0 && state.pause === 0)
        || state.playerScales.some((scale, i) => scale !== this.sim.playerScales[i]);
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
      const result = `Ganó el jugador ${this.sim.winner === 1 ? "izquierdo" : "derecho"}`;
      const message = this.confirmedFinished ? `¡Terminó el partido! ${result}` : paused ? "Partida pausada: los dos deben volver a la pestaña del juego." : this.sim.goldenGoal ? "¡Gol de oro! El próximo gol gana." : "";
      this.status.setText(message).setVisible(Boolean(message));
      this.pingText.setText(`Conexión directa: ${this.peer.rtt ? Math.round(this.peer.rtt) + " ms" : "midiendo…"} · Jugás a la ${this.peer.host ? "izquierda" : "derecha"}`);
      this.networkText.setText(this.peer.rtt > 200 ? "Demora alta: prueben cable de red y pausen las descargas en ambas casas." : "");
    }
    this.scoreText.setText(this.confirmedScore.join(" : "));
    const seconds = Math.ceil(this.sim.remainingTicks / 60);
    this.clockText.setText(this.mode === "practice" ? "PRACTICE · ∞" : this.mode === "first-to-seven" ? "FIRST TO 7" : this.sim.goldenGoal ? "GOL DE ORO" : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`);
    this.replayButton.setVisible(this.confirmedFinished && this.peer.ready);
    this.replayPanel.setVisible(this.confirmedFinished && this.peer.ready);
    this.cornerScores.forEach((text, i) => text.setText(String(this.confirmedScore[i])));
    this.goalText.setVisible(this.started && (this.sim.pause > 0 || this.confirmedFinished));
    this.goalText.setText(this.confirmedFinished ? "¡FINAL DEL PARTIDO!" : "¡GOL!");
    this.clockText.setColor(this.mode === "timed" && seconds <= 10 ? "#a62e21" : "#245e27");
    const ready = this.sim.ready[this.peer.host ? 0 : 1];
    this.replayButton.setText(ready ? "Esperando al otro jugador…" : this.sim.ready.some(Boolean) ? "Tu rival quiere revancha · Jugar otra vez" : "Jugar otra vez");
    this.replayButton.setAlpha(ready ? 0.7 : 1);
    if (this.confirmedFinished || this.sim.finished) { this.accumulator = 0; this.renderBodies(delta); return; }
    if (!this.started || !this.peer.ready || paused) { this.accumulator = 0; return; }
    const { jump, left, right, kick } = this.keys;
    this.local.direction = left.isDown ? -1 : right.isDown ? 1 : 0;
    this.local.jumpHeld = jump.isDown;
    this.local.kickHeld = kick.isDown;
    if (Phaser.Input.Keyboard.JustDown(jump)) this.local.jump++;
    if (Phaser.Input.Keyboard.JustDown(kick)) this.local.kick++;
    this.accumulator += Math.min(delta, 100);
    while (this.accumulator >= RULES.stepMs) {
      this.accumulator -= RULES.stepMs;
      this.local.seq++;
      if (this.peer.host) {
        if (performance.now() - this.remoteAt > RULES.inputTimeoutMs) this.releaseControls(this.remote);
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
    this.releaseControls(this.local); this.releaseControls(this.remote);
    this.pending = []; this.accumulator = 0;
    this.input.keyboard?.resetKeys();
    this.corrections = this.corrections.map(() => ({ x: 0, y: 0 }));
  }

  private releaseControls(input: Input) {
    input.direction = 0; input.jumpHeld = false; input.kickHeld = false;
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
    this.goals.forEach((goal, i) => {
      const scale = this.sim.goalScale(i === 0 ? 1 : 2);
      if (scale !== this.drawnGoalScales[i]) {
        renderGoal(goal, i === 1, scale);
        this.drawnGoalScales[i] = scale;
      }
    });
    [...this.sim.players, this.sim.ball].forEach((body, i) => {
      this.corrections[i].x *= decay; this.corrections[i].y *= decay;
      const sprite = i === 2 ? this.ball : this.heads[i];
      sprite.setPosition(body.position.x + this.corrections[i].x, body.position.y + this.corrections[i].y);
      if (i === 2) sprite.setRotation(this.sim.ballRotation);
      else sprite.setDisplaySize(VISUALS.player.width * this.sim.playerScales[i], VISUALS.player.height * this.sim.playerScales[i]);
    });
    this.boots.forEach((boot, i) => {
      // Matter resuelve dinamicamente la posicion y el giro del pie. El sprite
      // sigue ese cuerpo en vez de reconstruir una pose limitada desde `lift`;
      // asi los contactos y el barrido se dibujan como los ve la simulacion.
      const body = this.sim.boots[i];
      boot.setPosition(body.position.x, body.position.y);
      boot.setRotation(body.angle);
      boot.setDisplaySize(VISUALS.boot.width * this.sim.playerScales[i], VISUALS.boot.height * this.sim.playerScales[i]);
    });
    this.renderPowerups();
  }

  private renderPowerups() {
    const visibleIds = new Set(this.sim.powerups.map(item => item.id));
    for (const [id, sprite] of this.powerupSprites) {
      if (visibleIds.has(id)) continue;
      sprite.star.destroy(); sprite.icon.destroy(); sprite.label.destroy();
      this.powerupSprites.delete(id);
    }
    for (const item of this.sim.powerups) {
      if (this.powerupSprites.has(item.id)) continue;
      const display = POWERUP_DISPLAY[item.type];
      const star = this.add.star(item.x, item.y, 14, 12, POWERUP_RULES.radius,
        display.beneficial ? 0x328e37 : 0xb8312b).setStrokeStyle(2, 0xf5f2d9);
      const icon = this.add.text(item.x, item.y, display.icon, { fontFamily: ARCADE_FONT, fontSize: 17,
        color: "#fffbea", stroke: "#1d261b", strokeThickness: 3 }).setOrigin(0.5);
      const label = this.add.text(item.x, item.y + 24, display.label, { fontFamily: ARCADE_FONT, fontSize: 11,
        color: "#fffbea", backgroundColor: "#1b3028", padding: { x: 3, y: 1 } }).setOrigin(0.5, 0);
      this.powerupSprites.set(item.id, { star, icon, label });
    }
    const active = new Set<string>();
    const order = [0, 0];
    for (const effect of this.sim.effects) {
      const key = `${effect.target}:${effectGroup(effect.type)}`;
      active.add(key);
      const display = POWERUP_DISPLAY[effect.type];
      const activeColor = (display.activeHarmful ?? !display.beneficial) ? "#a02b27" : "#287537";
      let badge = this.effectBadges.get(key);
      if (!badge) {
        badge = this.add.text(0, 0, "", { fontFamily: ARCADE_FONT, fontSize: 13,
          color: "#fffbea", backgroundColor: activeColor,
          padding: { x: 5, y: 3 } }).setOrigin(0.5);
        this.effectBadges.set(key, badge);
      }
      badge.setBackgroundColor(activeColor);
      const i = effect.target - 1;
      const slot = order[i]++;
      const isGoal = effectGroup(effect.type) === "goal";
      const x = isGoal ? (i === 0 ? RULES.goalWidth / 2 : 1024 - RULES.goalWidth / 2)
        : this.sim.players[i].position.x;
      const y = isGoal ? this.sim.goalTop(effect.target) - 28 - slot * 24
        : this.sim.players[i].position.y - RULES.playerRadius * this.sim.playerScales[i] - 22 - slot * 24;
      badge.setText(`${display.icon} ${display.activeLabel ?? display.label} ${Math.ceil(effect.remainingTicks / 60)}s`);
      badge.setPosition(Math.max(70, Math.min(954, x)), Math.max(46, y));
    }
    for (const [key, badge] of this.effectBadges) {
      if (active.has(key)) continue;
      badge.destroy(); this.effectBadges.delete(key);
    }
  }
}

function isSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as Snapshot;
  const numbers = (a: unknown) => Array.isArray(a) && a.length === 2 && a.every(Number.isFinite);
  const body = (b: unknown) => !!b && typeof b === "object" && ["x", "y", "vx", "vy", "angle", "spin"].every(k => Number.isFinite((b as Record<string, unknown>)[k]));
  const foot = (f: Snapshot["feet"][number]) => !!f && Number.isFinite(f.lift) && f.lift >= 0 && f.lift <= 1
    && Number.isSafeInteger(f.tapTicks) && f.tapTicks >= 0 && f.tapTicks <= RULES.bootTapTicks;
  const boots = (v as Snapshot).boots;
  const powerup = (item: Snapshot["powerups"][number]) => !!item && isPowerupType(item.type)
    && Number.isSafeInteger(item.id) && item.id > 0 && Number.isFinite(item.x) && item.x >= 0 && item.x <= 1024
    && Number.isFinite(item.y) && item.y >= 0 && item.y <= 590
    && Number.isSafeInteger(item.remainingTicks) && item.remainingTicks > 0 && item.remainingTicks <= POWERUP_RULES.lifeTicks;
  const effect = (item: Snapshot["effects"][number]) => !!item && isPowerupType(item.type)
    && (item.target === 1 || item.target === 2) && Number.isSafeInteger(item.remainingTicks)
    && item.remainingTicks > 0 && item.remainingTicks <= POWERUP_RULES.effectTicks;
  return Number.isSafeInteger(v.tick) && v.tick >= 0 && Number.isSafeInteger(v.round) && Number.isSafeInteger(v.pause)
    && Number.isSafeInteger(v.match) && v.match >= 0
    && isMatchMode(v.mode) && (v.winner === null || v.winner === 1 || v.winner === 2)
    && Number.isSafeInteger(v.remainingTicks) && v.remainingTicks >= 0 && v.remainingTicks <= RULES.matchTicks
    && Array.isArray(v.ready) && v.ready.length === 2 && v.ready.every(b => typeof b === "boolean")
    && numbers(v.score) && numbers(v.kicks) && Number.isFinite(v.ballRotation)
    && Number.isFinite(v.ballRollMs) && v.ballRollMs >= 0 && v.ballRollMs <= RULES.rollLimitDelayMs
    && Array.isArray(v.roofSlide) && v.roofSlide.length === 2 && v.roofSlide.every(b => typeof b === "boolean")
    && Array.isArray(v.feet) && v.feet.length === 2 && v.feet.every(foot)
    && Array.isArray(boots) && boots.length === 2 && boots.every(body)
    && Array.isArray(v.inputs) && v.inputs.length === 2 && v.inputs.every(isInput)
    && Array.isArray(v.players) && v.players.length === 2 && v.players.every(body) && body(v.ball)
    && Array.isArray(v.powerups) && v.powerups.length <= POWERUP_RULES.maxVisible && v.powerups.every(powerup)
    && Array.isArray(v.effects) && v.effects.length <= 12 && v.effects.every(effect)
    && (v.lastTouch === null || v.lastTouch === 1 || v.lastTouch === 2)
    && Number.isSafeInteger(v.spawnClock) && v.spawnClock >= 0 && v.spawnClock < POWERUP_RULES.spawnTicks
    && Number.isSafeInteger(v.nextPowerupId) && v.nextPowerupId > 0
    && Number.isSafeInteger(v.randomState) && v.randomState > 0 && v.randomState <= 0xffffffff
    && Array.isArray(v.playerScales) && v.playerScales.length === 2
    && v.playerScales.every(scale => scale === 1 || scale === POWERUP_RULES.grow || scale === POWERUP_RULES.shrink);
}
