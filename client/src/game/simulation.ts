import Matter from "matter-js";

// Única definición de las reglas: anfitrión y predicción usan la misma física.
export const RULES = {
  stepMs: 1000 / 60, speed: 4, jump: -6, kickX: 7, kickY: -8,
  kickReach: 75, kickCooldownTicks: 18, goalPauseTicks: 45,
  inputTimeoutMs: 750, snapshotEveryTicks: 2,
};
export type Team = 1 | 2;
export type Input = { seq: number; direction: -1 | 0 | 1; jump: number; kick: number };
export const emptyInput = (): Input => ({ seq: 0, direction: 0, jump: 0, kick: 0 });
export type BodyState = { x: number; y: number; vx: number; vy: number; angle: number; spin: number };
export type Snapshot = {
  tick: number; round: number; pause: number; score: [number, number];
  players: [BodyState, BodyState]; ball: BodyState;
  inputs: [Input, Input]; kicks: [number, number];
};
const { Engine, Bodies, Body, Composite } = Matter;

export class Simulation {
  engine = Engine.create({ gravity: { x: 0, y: 0.7, scale: 0.001 } });
  players = [200, 824].map(x => Bodies.circle(x, 550, 22, { mass: 20, restitution: 0.3, inertia: Infinity }));
  ball = Bodies.circle(512, 400, 10, { mass: 3, restitution: 1, friction: 0.05, frictionAir: 0.005 });
  tick = 0;
  round = 0;
  pause = 0;
  score: [number, number] = [0, 0];
  inputs: [Input, Input] = [emptyInput(), emptyInput()];
  kicks: [number, number] = [-100, -100];

  constructor() {
    Composite.add(this.engine.world, [
      ...this.players, this.ball,
      Bodies.rectangle(-10, 300, 20, 768, { isStatic: true }),
      Bodies.rectangle(1034, 300, 20, 768, { isStatic: true }),
      Bodies.rectangle(512, -10, 1024, 20, { isStatic: true }),
      Bodies.rectangle(512, 600, 1024, 20, { isStatic: true, friction: 0.3 }),
      Bodies.rectangle(40, 465, 80, 5, { isStatic: true, angle: 0.05, restitution: 1 }),
      Bodies.rectangle(984, 465, 80, 5, { isStatic: true, angle: -0.05, restitution: 1 }),
    ]);
    this.serve();
  }

  private serve() {
    this.players.forEach((p, i) => {
      Body.setPosition(p, { x: i === 0 ? 200 : 824, y: 550 });
      Body.setVelocity(p, { x: 0, y: 0 });
      Body.setAngularVelocity(p, 0);
    });
    Body.setPosition(this.ball, { x: 512, y: 400 });
    Body.setVelocity(this.ball, { x: this.round % 2 ? -4 : 4, y: -3 });
    Body.setAngularVelocity(this.ball, 0);
    // No reutilizar contactos de la posición anterior después de un gol.
    this.resetCollisions();
  }

  step(one: Input, two: Input) {
    this.tick++;
    const next = [one, two];
    if (this.pause > 0) {
      this.inputs = [{ ...one }, { ...two }];
      if (--this.pause === 0) this.serve();
      return;
    }
    next.forEach((input, i) => {
      const player = this.players[i];
      Body.setVelocity(player, { x: input.direction * RULES.speed, y: player.velocity.y });
      if (input.jump > this.inputs[i].jump && player.position.y >= 565 && Math.abs(player.velocity.y) < 1) {
        Body.setVelocity(player, { x: player.velocity.x, y: RULES.jump });
      }
      if (input.kick > this.inputs[i].kick && this.tick - this.kicks[i] >= RULES.kickCooldownTicks) {
        this.kicks[i] = this.tick;
        if (Math.hypot(this.ball.position.x - player.position.x, this.ball.position.y - player.position.y) <= RULES.kickReach) {
          Body.setVelocity(this.ball, { x: i === 0 ? RULES.kickX : -RULES.kickX, y: RULES.kickY });
          Body.setAngularVelocity(this.ball, i === 0 ? 0.5 : -0.5);
        }
      }
    });
    this.inputs = [{ ...one }, { ...two }];
    Engine.update(this.engine, RULES.stepMs);
    const { x, y } = this.ball.position;
    if (y > 480 && (x < 65 || x > 959)) {
      this.score[x < 65 ? 1 : 0]++;
      this.round++;
      this.pause = RULES.goalPauseTicks;
    }
  }

  snapshot(): Snapshot {
    const body = (b: Matter.Body): BodyState => ({ x: b.position.x, y: b.position.y, vx: b.velocity.x, vy: b.velocity.y, angle: b.angle, spin: b.angularVelocity });
    return { tick: this.tick, round: this.round, pause: this.pause, score: [...this.score],
      players: [body(this.players[0]), body(this.players[1])], ball: body(this.ball),
      inputs: [{ ...this.inputs[0] }, { ...this.inputs[1] }], kicks: [...this.kicks] };
  }

  restore(state: Snapshot) {
    const body = (b: Matter.Body, s: BodyState) => {
      Body.setPosition(b, { x: s.x, y: s.y });
      Body.setAngle(b, s.angle);
      Body.setVelocity(b, { x: s.vx, y: s.vy });
      Body.setAngularVelocity(b, s.spin);
    };
    this.tick = state.tick; this.round = state.round; this.pause = state.pause;
    this.score = [...state.score]; this.inputs = state.inputs.map(i => ({ ...i })) as [Input, Input];
    this.kicks = [...state.kicks];
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
  return [-1, 0, 1].includes(v.direction) && [v.seq, v.jump, v.kick].every(n => Number.isSafeInteger(n) && n >= 0);
}
