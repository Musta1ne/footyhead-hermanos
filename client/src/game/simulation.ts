import Matter from "matter-js";

// Única definición de las reglas: anfitrión y predicción usan la misma física.
export const RULES = {
  // Velocidades en px/paso de 60 Hz, aceleraciones en px/paso².
  // Medidas y márgenes de la referencia en PHYSICS.md.
  stepMs: 1000 / 60, substeps: 2,
  speed: 3.75, acceleration: 0.65, releaseDrag: 0.82, jump: -4.3,
  playerGravity: 0.145, ballGravity: 0.1,
  playerRadius: 22, ballRadius: 12, ballRestitution: 0.9, wallRestitution: 1,
  maxBallSpeed: 14, serveY: 295, serveXSpeed: 3, serveYSpeed: -2.1,
  kickX: 5.5, kickY: -3.6, bootRadius: 12,
  kickDurationTicks: 12, kickCooldownTicks: 18, goalPauseTicks: 45,
  inputTimeoutMs: 750, snapshotEveryTicks: 2,
  matchTicks: 60 * 60,
};
export type Team = 1 | 2;
export type Input = { seq: number; direction: -1 | 0 | 1; jump: number; kick: number; jumpHeld: boolean; kickHeld: boolean };
export const emptyInput = (): Input => ({ seq: 0, direction: 0, jump: 0, kick: 0, jumpHeld: false, kickHeld: false });
export type BodyState = { x: number; y: number; vx: number; vy: number; angle: number; spin: number };
export type Snapshot = {
  tick: number; round: number; pause: number; score: [number, number];
  match: number; remainingTicks: number; ready: [boolean, boolean];
  players: [BodyState, BodyState]; ball: BodyState;
  inputs: [Input, Input]; kicks: [number, number]; kickHits: [number, number];
};
const { Engine, Bodies, Body, Composite, Query } = Matter;

// Dibujo y contacto usan el mismo recorrido del pie, relativo a la cabeza.
export function bootPose(team: Team, age: number) {
  const active = age >= 0 && age < RULES.kickDurationTicks;
  const swing = active ? Math.sin(age / RULES.kickDurationTicks * Math.PI) : 0;
  const side = team === 1 ? 1 : -1;
  return { x: side * (-12 + swing * 55), y: 25 - swing * 20, angle: side * (-1.3 + swing * 1.8), active };
}

export class Simulation {
  engine = Engine.create({ gravity: { x: 0, y: 1, scale: RULES.ballGravity / RULES.stepMs ** 2 } });
  players = [200, 824].map(x => Bodies.circle(x, 550, RULES.playerRadius, { mass: 20, restitution: 0, friction: 0, frictionAir: 0, inertia: Infinity }));
  ball = Bodies.circle(512, RULES.serveY, RULES.ballRadius, { mass: 3, restitution: RULES.ballRestitution, friction: 0.025, frictionAir: 0 });
  tick = 0;
  match = 0;
  remainingTicks = RULES.matchTicks;
  ready: [boolean, boolean] = [false, false];
  get finished() { return this.remainingTicks === 0; }
  get winner(): Team | null {
    return !this.finished || this.score[0] === this.score[1] ? null : this.score[0] > this.score[1] ? 1 : 2;
  }

  requestRematch(team: Team, match: number) {
    if (!this.finished || match !== this.match || this.ready[team - 1]) return false;
    this.ready[team - 1] = true;
    // El tick global también ordena estados enviados por canales diferentes.
    this.tick++;
    if (this.ready.every(Boolean)) {
      this.match++;
      this.remainingTicks = RULES.matchTicks;
      this.ready = [false, false];
      this.score = [0, 0]; this.round = 0; this.pause = 0;
      this.inputs = this.inputs.map(input => ({ ...input, direction: 0, jumpHeld: false, kickHeld: false })) as [Input, Input];
      this.kicks = [-100, -100];
      this.kickHits = [-100, -100];
      this.serve();
    }
    return true;
  }
  round = 0;
  pause = 0;
  score: [number, number] = [0, 0];
  inputs: [Input, Input] = [emptyInput(), emptyInput()];
  kicks: [number, number] = [-100, -100];
  kickHits: [number, number] = [-100, -100];

  constructor() {
    Composite.add(this.engine.world, [
      ...this.players, this.ball,
      Bodies.rectangle(-10, 300, 20, 768, { isStatic: true, restitution: RULES.wallRestitution }),
      Bodies.rectangle(1034, 300, 20, 768, { isStatic: true, restitution: RULES.wallRestitution }),
      Bodies.rectangle(512, -10, 1024, 20, { isStatic: true, restitution: RULES.wallRestitution }),
      Bodies.rectangle(512, 600, 1024, 20, { isStatic: true, friction: 0.3 }),
      Bodies.rectangle(40, 465, 80, 5, { isStatic: true, angle: 0.05, restitution: RULES.wallRestitution }),
      Bodies.rectangle(984, 465, 80, 5, { isStatic: true, angle: -0.05, restitution: RULES.wallRestitution }),
    ]);
    this.serve();
  }

  private serve() {
    this.players.forEach((p, i) => {
      Body.setPosition(p, { x: i === 0 ? 200 : 824, y: 550 });
      Body.setVelocity(p, { x: 0, y: 0 });
      Body.setAngularVelocity(p, 0);
    });
    Body.setPosition(this.ball, { x: 512, y: RULES.serveY });
    Body.setVelocity(this.ball, { x: this.round % 2 ? -RULES.serveXSpeed : RULES.serveXSpeed, y: RULES.serveYSpeed });
    Body.setAngularVelocity(this.ball, 0);
    this.kicks = [-100, -100]; this.kickHits = [-100, -100];
    // No reutilizar contactos de la posición anterior después de un gol.
    this.resetCollisions();
  }

  step(one: Input, two: Input) {
    if (this.finished) return;
    this.tick++;
    this.remainingTicks--;
    const next = [one, two];
    if (this.pause > 0) {
      this.inputs = [{ ...one }, { ...two }];
      if (--this.pause === 0) this.serve();
      return;
    }
    next.forEach((input, i) => {
      const player = this.players[i];
      const target = input.direction * RULES.speed;
      let vx = input.direction === 0 ? player.velocity.x * RULES.releaseDrag
        : player.velocity.x + Math.max(-RULES.acceleration, Math.min(RULES.acceleration, target - player.velocity.x));
      if (Math.abs(vx) < 0.03) vx = 0;
      Body.setVelocity(player, { x: vx, y: player.velocity.y });
      if ((input.jump > this.inputs[i].jump || input.jumpHeld) && this.supported(player)) {
        Body.setVelocity(player, { x: player.velocity.x, y: RULES.jump });
      }
      if ((input.kick > this.inputs[i].kick || input.kickHeld) && this.tick - this.kicks[i] >= RULES.kickCooldownTicks) {
        this.kicks[i] = this.tick;
      }
    });
    this.inputs = [{ ...one }, { ...two }];
    for (let substep = 0; substep < RULES.substeps; substep++) {
      this.players.forEach((player, i) => {
        Body.applyForce(player, player.position, { x: 0, y: player.mass * (RULES.playerGravity - RULES.ballGravity) / RULES.stepMs ** 2 });
        this.kickContact(i, this.tick + substep / RULES.substeps - this.kicks[i]);
      });
      this.limitBallSpeed();
      Engine.update(this.engine, RULES.stepMs / RULES.substeps);
      this.limitBallSpeed();
    }
    const { x, y } = this.ball.position;
    if (y > 480 && (x < 65 || x > 959)) {
      this.score[x < 65 ? 1 : 0]++;
      this.round++;
      this.pause = RULES.goalPauseTicks;
    }
  }

  private supported(player: Matter.Body) {
    if (Math.abs(player.velocity.y) > 0.75) return false;
    const surfaces = Composite.allBodies(this.engine.world).filter(body => body !== player && body !== this.ball && body.bounds.min.y > player.position.y);
    const foot = { x: player.position.x, y: player.bounds.max.y - 1 };
    return Query.ray(surfaces, foot, { x: foot.x, y: foot.y + 3 }, 4).length > 0;
  }

  private kickContact(i: number, age: number) {
    if (this.kickHits[i] === this.kicks[i]) return;
    const pose = bootPose(i === 0 ? 1 : 2, age);
    if (!pose.active) return;
    const player = this.players[i], side = i === 0 ? 1 : -1;
    if ((this.ball.position.x - player.position.x) * side < 0) return;
    const dx = this.ball.position.x - player.position.x - pose.x;
    const dy = this.ball.position.y - player.position.y - pose.y;
    if (Math.hypot(dx, dy) > RULES.bootRadius + RULES.ballRadius) return;
    this.kickHits[i] = this.kicks[i];
    Body.setVelocity(this.ball, {
      x: side * RULES.kickX + player.velocity.x * 0.35,
      y: RULES.kickY + Math.max(-1, Math.min(1, dy * 0.05)) + Math.min(0, player.velocity.y) * 0.3,
    });
    Body.setAngularVelocity(this.ball, side * 0.2);
  }

  private limitBallSpeed() {
    const speed = Math.hypot(this.ball.velocity.x, this.ball.velocity.y);
    if (speed > RULES.maxBallSpeed) Body.setVelocity(this.ball, { x: this.ball.velocity.x * RULES.maxBallSpeed / speed, y: this.ball.velocity.y * RULES.maxBallSpeed / speed });
  }

  snapshot(): Snapshot {
    const body = (b: Matter.Body): BodyState => ({ x: b.position.x, y: b.position.y, vx: b.velocity.x, vy: b.velocity.y, angle: b.angle, spin: b.angularVelocity });
    return { tick: this.tick, round: this.round, pause: this.pause, score: [...this.score],
      match: this.match, remainingTicks: this.remainingTicks, ready: [...this.ready],
      players: [body(this.players[0]), body(this.players[1])], ball: body(this.ball),
      inputs: [{ ...this.inputs[0] }, { ...this.inputs[1] }], kicks: [...this.kicks], kickHits: [...this.kickHits] };
  }

  restore(state: Snapshot) {
    const body = (b: Matter.Body, s: BodyState) => {
      Body.setPosition(b, { x: s.x, y: s.y });
      Body.setAngle(b, s.angle);
      Body.setVelocity(b, { x: s.vx, y: s.vy });
      Body.setAngularVelocity(b, s.spin);
    };
    this.tick = state.tick; this.round = state.round; this.pause = state.pause;
    this.match = state.match; this.remainingTicks = state.remainingTicks; this.ready = [...state.ready];
    this.score = [...state.score]; this.inputs = state.inputs.map(i => ({ ...i })) as [Input, Input];
    this.kicks = [...state.kicks];
    this.kickHits = [...state.kickHits];
    this.players.forEach((p, i) => body(p, state.players[i])); body(this.ball, state.ball);
    this.resetCollisions();
  }

  private resetCollisions() {
    Engine.clear(this.engine);
    // Engine.clear también vacía el detector. Volver a registrar todos los
    // cuerpos, incluido el piso, aunque el mundo no haya sido modificado.
    Matter.Detector.setBodies(this.engine.detector, Composite.allBodies(this.engine.world));
  }

  destroy() { Composite.clear(this.engine.world, false); Engine.clear(this.engine); }
}

export function isInput(value: unknown): value is Input {
  if (!value || typeof value !== "object") return false;
  const v = value as Input;
  return [-1, 0, 1].includes(v.direction) && typeof v.jumpHeld === "boolean" && typeof v.kickHeld === "boolean"
    && [v.seq, v.jump, v.kick].every(n => Number.isSafeInteger(n) && n >= 0);
}
