import Matter from "matter-js";
import { ARENA_SLOPES, PITCH_FLOOR_Y, REFERENCE_VISUALS, VISUAL_SCALE } from "./visual-proportions";

// Única definición de las reglas: anfitrión y predicción usan la misma física.
export const RULES = {
  // Velocidades en px/paso de 60 Hz, aceleraciones en px/paso².
  // Medidas y márgenes de la referencia en PHYSICS.md.
  stepMs: 1000 / 60, substeps: 3,
  speed: 3.75, acceleration: 0.65, releaseDrag: 0.82, jump: -4.3,
  playerGravity: 0.145, ballGravity: 0.1,
  // The original SWF uses 0.6 restitution. Keep this arena a little calmer
  // while preserving enough energy for visible rebounds and longer passes.
  playerRadius: 22 * VISUAL_SCALE, ballRadius: 10 * VISUAL_SCALE, ballRestitution: 0.48, wallRestitution: 0.45,
  ballDamping: 0.998,
  maxRollSpeed: 3, rollLimitDelayMs: 200, rollVerticalTolerance: 0.05, rollHorizontalTolerance: 0.01,
  maxBallSpeed: 10.5, serveY: 295, serveXSpeed: 2.5, serveYSpeed: -1.8,
  bootRadius: 8 * VISUAL_SCALE, bootOrbit: 27 * VISUAL_SCALE, bootRestAngle: 1.05,
  bootRaiseTicks: 8, bootLowerTicks: 8, bootTapTicks: 6, bootMotionTransfer: 0.55,
  bootWidth: 16 * VISUAL_SCALE, bootHeight: 18 * VISUAL_SCALE,
  goalWidth: REFERENCE_VISUALS.goal.width * VISUAL_SCALE,
  goalTop: PITCH_FLOOR_Y - REFERENCE_VISUALS.goal.height * VISUAL_SCALE,
  goalScoreX: 65 * VISUAL_SCALE, goalScoreY: PITCH_FLOOR_Y - (590 - 480) * VISUAL_SCALE,
  goalPauseTicks: 45,
  headRestitution: 0.4, bootRestitution: 0.45, kickX: 6, kickY: 5.6,
  inputTimeoutMs: 750, snapshotEveryTicks: 2,
  matchTicks: 60 * 60,
};
export type Team = 1 | 2;
export type Input = { seq: number; direction: -1 | 0 | 1; jump: number; kick: number; jumpHeld: boolean; kickHeld: boolean };
export const emptyInput = (): Input => ({ seq: 0, direction: 0, jump: 0, kick: 0, jumpHeld: false, kickHeld: false });
export type BodyState = { x: number; y: number; vx: number; vy: number; angle: number; spin: number };
export type FootState = { lift: number; tapTicks: number };
export type Snapshot = {
  tick: number; round: number; pause: number; score: [number, number];
  match: number; remainingTicks: number; ready: [boolean, boolean];
  players: [BodyState, BodyState]; ball: BodyState;
  inputs: [Input, Input]; kicks: [number, number]; feet: [FootState, FootState]; ballRotation: number; ballRollMs: number;
};
const { Engine, Bodies, Body, Composite, Query } = Matter;

// lift=0: reposo; lift=1: pie levantado. La órbita no atraviesa la cabeza.
// Dibujo y cuerpo sólido usan exactamente la misma posición.
export function bootPose(team: Team, lift: number) {
  // La referencia original barre desde atrás y abajo del cuerpo hasta delante,
  // a la altura de su centro; ambos lados usan exactamente el mismo espejo.
  const orbitAngle = RULES.bootRestAngle + (Math.PI - RULES.bootRestAngle) * lift;
  const side = team === 1 ? 1 : -1;
  return { x: -side * Math.cos(orbitAngle) * RULES.bootOrbit, y: Math.sin(orbitAngle) * RULES.bootOrbit, angle: side * (-1.3 + lift * 1.8) };
}

const COLLISION = { world: 1, head: 2, ball: 4, foot: 8 };

// Normal saliente y profundidad, incluso si el centro está dentro de la caja.
export function circleBox(x: number, y: number, radius: number, halfWidth: number, halfHeight: number) {
  const dx = x - Math.max(-halfWidth, Math.min(halfWidth, x));
  const dy = y - Math.max(-halfHeight, Math.min(halfHeight, y));
  const distance = Math.hypot(dx, dy);
  if (distance >= radius) return null;
  if (distance > 0) return { nx: dx / distance, ny: dy / distance, depth: radius - distance };
  const horizontal = halfWidth - Math.abs(x), vertical = halfHeight - Math.abs(y);
  return horizontal < vertical
    ? { nx: x < 0 ? -1 : 1, ny: 0, depth: radius + horizontal }
    : { nx: 0, ny: y <= 0 ? -1 : 1, depth: radius + vertical };
}

export class Simulation {
  engine = Engine.create({ gravity: { x: 0, y: 1, scale: RULES.ballGravity / RULES.stepMs ** 2 } });
  players = [200, 824].map(x => Bodies.circle(x, 550, RULES.playerRadius, { mass: 20, restitution: 0, friction: 0, frictionAir: 0, inertia: Infinity,
    collisionFilter: { category: COLLISION.head, group: Body.nextGroup(true) } }));
  // Sin torque físico: la rotación visual no modifica la normal de rebote.
  // El círculo mantiene su orientación; la pelota puede rodar sin frenarse.
  // Contenedor de estado compatible con snapshots; no se integra en Matter.
  ball = Bodies.circle(512, RULES.serveY, RULES.ballRadius, { mass: 1, frictionAir: 0, inertia: Infinity,
    collisionFilter: { category: COLLISION.ball, mask: 0 } });
  feet: [FootState, FootState] = [{ lift: 0, tapTicks: 0 }, { lift: 0, tapTicks: 0 }];
  boots = this.players.map(player => Bodies.circle(player.position.x, player.position.y, RULES.bootRadius, {
    isStatic: true, restitution: 0.15, friction: 0, frictionStatic: 0,
    collisionFilter: { category: COLLISION.foot, mask: COLLISION.head | COLLISION.ball, group: player.collisionFilter.group },
  }));
  ballRotation = 0;
  ballRollMs = 0;
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
      this.serve();
    }
    return true;
  }
  round = 0;
  pause = 0;
  score: [number, number] = [0, 0];
  inputs: [Input, Input] = [emptyInput(), emptyInput()];
  kicks: [number, number] = [-100, -100];

  constructor() {
    Composite.add(this.engine.world, [
      ...this.players, ...this.boots,
      Bodies.rectangle(-10, 300, 20, 768, { isStatic: true, restitution: RULES.wallRestitution }),
      Bodies.rectangle(1034, 300, 20, 768, { isStatic: true, restitution: RULES.wallRestitution }),
      Bodies.rectangle(512, -10, 1024, 20, { isStatic: true, restitution: RULES.wallRestitution }),
      Bodies.rectangle(512, 600, 1024, 20, { isStatic: true, friction: 0.3 }),
      Bodies.rectangle(RULES.goalWidth / 2, RULES.goalTop, RULES.goalWidth, 5 * VISUAL_SCALE, { isStatic: true, angle: 0.05, restitution: RULES.wallRestitution }),
      Bodies.rectangle(1024 - RULES.goalWidth / 2, RULES.goalTop, RULES.goalWidth, 5 * VISUAL_SCALE, { isStatic: true, angle: -0.05, restitution: RULES.wallRestitution }),
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
    this.kicks = [-100, -100];
    this.feet = [{ lift: 0, tapTicks: 0 }, { lift: 0, tapTicks: 0 }];
    this.ballRotation = 0;
    this.ballRollMs = 0;
    this.syncBoots();
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
      if (input.kick > this.inputs[i].kick || (input.kickHeld && !this.inputs[i].kickHeld)) {
        this.kicks[i] = this.tick;
        // Una pulsación que ocurrió entre dos fotogramas sigue siendo útil.
        // Una tecla sostenida, en cambio, baja apenas llega su liberación.
        this.feet[i].tapTicks = input.kickHeld ? 0 : RULES.bootTapTicks;
      }
    });
    this.inputs = [{ ...one }, { ...two }];
    for (let substep = 0; substep < RULES.substeps; substep++) {
      this.players.forEach((player, i) => {
        Body.applyForce(player, player.position, { x: 0, y: player.mass * (RULES.playerGravity - RULES.ballGravity) / RULES.stepMs ** 2 });
        this.moveBoot(i, next[i].kickHeld || this.feet[i].tapTicks > 0);
      });
      this.limitBallSpeed();
      Engine.update(this.engine, RULES.stepMs / RULES.substeps);
      this.limitBallSpeed();
      this.ballRotation = (this.ballRotation + this.ball.velocity.x / RULES.ballRadius / RULES.substeps) % (Math.PI * 2);
      this.syncBoots();
      this.resolveBootPair();
      this.stepBall();
    }
    this.feet.forEach(foot => { foot.tapTicks = Math.max(0, foot.tapTicks - 1); });
    const { x, y } = this.ball.position;
    if (y > RULES.goalScoreY && (x < RULES.goalScoreX || x > 1024 - RULES.goalScoreX)) {
      this.score[x < RULES.goalScoreX ? 1 : 0]++;
      this.round++;
      this.pause = RULES.goalPauseTicks;
    }
  }

  private supported(player: Matter.Body) {
    if (Math.abs(player.velocity.y) > 0.75) return false;
    const surfaces = Composite.allBodies(this.engine.world).filter(body => body !== player && body !== this.ball
      && body.collisionFilter.group !== player.collisionFilter.group && body.bounds.min.y > player.position.y);
    const foot = { x: player.position.x, y: player.bounds.max.y - 1 };
    return Query.ray(surfaces, foot, { x: foot.x, y: foot.y + 3 }, 4).length > 0;
  }

  private moveBoot(i: number, raised: boolean) {
    const team = i === 0 ? 1 : 2, foot = this.feet[i], player = this.players[i];
    const previous = bootPose(team, foot.lift);
    const rate = 1 / ((raised ? RULES.bootRaiseTicks : RULES.bootLowerTicks) * RULES.substeps);
    const nextLift = Math.max(0, Math.min(1, foot.lift + (raised ? rate : -rate)));
    let pose = bootPose(team, nextLift);
    if (!raised && nextLift < foot.lift) {
      const hit = circleBox(
        this.ball.position.x - player.position.x - pose.x,
        this.ball.position.y - player.position.y - pose.y,
        RULES.ballRadius,
        RULES.bootWidth / 2,
        RULES.bootHeight / 2,
      );
      if (hit) pose = previous;
      else foot.lift = nextLift;
    } else {
      foot.lift = nextLift;
    }
    const boot = this.boots[i];
    // En reposo queda recogida contra el cuerpo: no debe empujar el apoyo
    // bajo la cabeza al aterrizar sobre otro jugador.
    boot.collisionFilter.mask = foot.lift > 0.5 ? COLLISION.head : 0;
    Body.setPosition(boot, { x: player.position.x + pose.x, y: player.position.y + pose.y });
    // Cuerpo cinemático: transmite la velocidad de la cabeza y del barrido.
    // Quedarse levantado no inyecta impulsos ni dispara una patada nueva.
    // Matter no integra los cuerpos estáticos: su positionPrev debe expresar
    // el desplazamiento de este subpaso, no el de un paso completo.
    Body.setVelocity(boot, {
      x: player.velocity.x / RULES.substeps + (pose.x - previous.x) * RULES.bootMotionTransfer,
      y: player.velocity.y / RULES.substeps + (pose.y - previous.y) * RULES.bootMotionTransfer,
    });
  }

  private syncBoots() {
    this.boots.forEach((boot, i) => {
      const pose = bootPose(i === 0 ? 1 : 2, this.feet[i].lift), player = this.players[i];
      boot.collisionFilter.mask = this.feet[i].lift > 0.5 ? COLLISION.head : 0;
      Body.setPosition(boot, { x: player.position.x + pose.x, y: player.position.y + pose.y });
    });
  }

  private resolveBootPair() {
    // Matter omite pares estático-estático. Las botas están ancladas a sus
    // jugadores: su contacto separa a los dueños en lugar de superponer pies.
    const dx = this.boots[1].position.x - this.boots[0].position.x;
    const dy = this.boots[1].position.y - this.boots[0].position.y;
    const distance = Math.hypot(dx, dy), overlap = RULES.bootRadius * 2 - distance;
    if (overlap <= 0) return;
    const nx = distance > 0.001 ? dx / distance : 1, ny = distance > 0.001 ? dy / distance : 0;
    const [one, two] = this.players;
    const inverseMass = one.inverseMass + two.inverseMass;
    const shareOne = one.inverseMass / inverseMass, shareTwo = two.inverseMass / inverseMass;
    Body.translate(one, { x: -nx * overlap * shareOne, y: -ny * overlap * shareOne });
    Body.translate(two, { x: nx * overlap * shareTwo, y: ny * overlap * shareTwo });
    const approaching = (two.velocity.x - one.velocity.x) * nx + (two.velocity.y - one.velocity.y) * ny;
    if (approaching < 0) {
      Body.setVelocity(one, { x: one.velocity.x + nx * approaching * shareOne, y: one.velocity.y + ny * approaching * shareOne });
      Body.setVelocity(two, { x: two.velocity.x - nx * approaching * shareTwo, y: two.velocity.y - ny * approaching * shareTwo });
    }
    this.syncBoots();
  }

  private limitBallSpeed() {
    const speed = Math.hypot(this.ball.velocity.x, this.ball.velocity.y);
    if (speed > RULES.maxBallSpeed) Body.setVelocity(this.ball, { x: this.ball.velocity.x * RULES.maxBallSpeed / speed, y: this.ball.velocity.y * RULES.maxBallSpeed / speed });
  }

  private stepBall() {
    const dt = 1 / RULES.substeps, radius = RULES.ballRadius;
    let { x, y } = this.ball.position;
    const damping = RULES.ballDamping ** dt;
    let vx = this.ball.velocity.x * damping;
    let vy = (this.ball.velocity.y + RULES.ballGravity * dt) * damping;
    x += vx * dt; y += vy * dt;
    const contact = (nx: number, ny: number, depth: number, restitution: number, ux = 0, uy = 0) => {
      x += nx * (depth + 0.000001); y += ny * (depth + 0.000001);
      const relative = (vx - ux) * nx + (vy - uy) * ny;
      if (relative < 0) {
        const impulse = -(1 + restitution) * relative;
        vx += impulse * nx; vy += impulse * ny;
      }
    };
    // Primero la bota: una patada baja debe poder alcanzar la pelota junto a la cabeza.
    this.boots.forEach((boot, i) => {
      const hit = circleBox(x - boot.position.x, y - boot.position.y, radius, RULES.bootWidth / 2, RULES.bootHeight / 2);
      if (!hit) return;
      const active = this.tick - this.kicks[i] < RULES.bootRaiseTicks;
      contact(hit.nx, hit.ny, hit.depth, RULES.bootRestitution);
      if (active) { vx = (i === 0 ? 1 : -1) * RULES.kickX; vy = -RULES.kickY; }
    });
    this.players.forEach((player, i) => {
      const dx = x - player.position.x, dy = y - player.position.y;
      const distance = Math.hypot(dx, dy), overlap = radius + RULES.playerRadius - distance;
      if (overlap <= 0) return;
      // Coincidencia exacta: normal estable, sin división por cero.
      const nx = distance > 0 ? dx / distance : i === 0 ? 1 : -1;
      const ny = distance > 0 ? dy / distance : 0;
      contact(nx, ny, overlap, RULES.headRestitution, player.velocity.x, player.velocity.y);
    });
    // Las barras conservan su inclinación visual: círculo contra caja en su espacio local.
    for (const [cx, angle] of [[RULES.goalWidth / 2, 0.05], [1024 - RULES.goalWidth / 2, -0.05]]) {
      const cos = Math.cos(angle), sin = Math.sin(angle), dx = x - cx, dy = y - RULES.goalTop;
      const hit = circleBox(dx * cos + dy * sin, -dx * sin + dy * cos, radius, RULES.goalWidth / 2, 2.5 * VISUAL_SCALE);
      if (hit) contact(hit.nx * cos - hit.ny * sin, hit.nx * sin + hit.ny * cos, hit.depth, RULES.wallRestitution);
    }
    for (const [start, end] of ARENA_SLOPES) {
      const sx = end.x - start.x, sy = end.y - start.y;
      const length = Math.hypot(sx, sy);
      const along = ((x - start.x) * sx + (y - start.y) * sy) / (length * length);
      if (along < 0 || along > 1) continue;
      const nx = sy / length, ny = -sx / length;
      const distance = (x - start.x) * nx + (y - start.y) * ny;
      if (distance < radius) contact(nx, ny, radius - distance, RULES.wallRestitution);
    }
    if (x < radius) contact(1, 0, radius - x, RULES.wallRestitution);
    if (x > 1024 - radius) contact(-1, 0, x - (1024 - radius), RULES.wallRestitution);
    if (y < radius) contact(0, 1, radius - y, RULES.wallRestitution);
    const onFloor = y >= PITCH_FLOOR_Y - radius;
    if (onFloor) {
      contact(0, -1, y - (PITCH_FLOOR_Y - radius), RULES.ballRestitution);
      if (Math.abs(vy) < RULES.ballGravity * dt) vy = 0;
    }
    const rolling = onFloor
      && Math.abs(vy) <= RULES.rollVerticalTolerance
      && Math.abs(vx) > RULES.rollHorizontalTolerance;
    if (rolling) {
      const elapsed = this.ballRollMs + RULES.stepMs * dt;
      this.ballRollMs = elapsed >= RULES.rollLimitDelayMs - 0.000001 ? RULES.rollLimitDelayMs : elapsed;
      if (this.ballRollMs >= RULES.rollLimitDelayMs && Math.abs(vx) > RULES.maxRollSpeed) {
        vx = Math.sign(vx) * RULES.maxRollSpeed;
      }
    } else {
      this.ballRollMs = 0;
    }
    Body.setPosition(this.ball, { x, y });
    Body.setVelocity(this.ball, { x: vx, y: vy });
    this.limitBallSpeed();
  }

  snapshot(): Snapshot {
    const body = (b: Matter.Body): BodyState => ({ x: b.position.x, y: b.position.y, vx: b.velocity.x, vy: b.velocity.y, angle: b.angle, spin: b.angularVelocity });
    return { tick: this.tick, round: this.round, pause: this.pause, score: [...this.score],
      match: this.match, remainingTicks: this.remainingTicks, ready: [...this.ready],
      players: [body(this.players[0]), body(this.players[1])], ball: body(this.ball),
      inputs: [{ ...this.inputs[0] }, { ...this.inputs[1] }], kicks: [...this.kicks],
      feet: [{ ...this.feet[0] }, { ...this.feet[1] }], ballRotation: this.ballRotation, ballRollMs: this.ballRollMs };
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
    this.feet = [{ ...state.feet[0] }, { ...state.feet[1] }];
    this.ballRotation = state.ballRotation;
    this.ballRollMs = state.ballRollMs;
    this.players.forEach((p, i) => body(p, state.players[i])); body(this.ball, state.ball);
    this.syncBoots();
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
