import Matter from "matter-js";

// El SWF original usa unidades de pantalla (800 px), 30 FPS y una escala de
// tiempo de 1/96 s por subpaso. Esta versión corre la simulación a 60 Hz en
// un escenario de 1024 px; las velocidades y la gravedad del balón se
// convierten a px/tick, sin alterar el protocolo de snapshots.
const ORIGINAL_WORLD_WIDTH = 800;
const PROJECT_WORLD_WIDTH = 1024;
const PROJECT_TICK_HZ = 60;
const ORIGINAL_DISPLAY_FPS = 30;
const ORIGINAL_PHYSICS_STEP_SECONDS = 1 / 96;
const ORIGINAL_PHYSICS_STEPS_PER_DISPLAY_FRAME = 3;
const ORIGINAL_TO_PROJECT = PROJECT_WORLD_WIDTH / ORIGINAL_WORLD_WIDTH;
// The source advances 3/96 seconds per 30 FPS frame. Two target ticks map
// to one source display frame, so one target tick represents 1/64 source s.
const targetTickSeconds = ORIGINAL_PHYSICS_STEP_SECONDS * ORIGINAL_PHYSICS_STEPS_PER_DISPLAY_FRAME
  / (PROJECT_TICK_HZ / ORIGINAL_DISPLAY_FPS);
const originalVelocity = (value: number) => value * ORIGINAL_TO_PROJECT * targetTickSeconds;
const originalAcceleration = (value: number) => value * ORIGINAL_TO_PROJECT * targetTickSeconds ** 2;

// Única definición de las reglas: anfitrión y predicción usan la misma física.
export const RULES = {
  // Velocidades en px/paso de 60 Hz, aceleraciones en px/paso².
  // Las magnitudes del balón salen de physics/parameters.json del clon original.
  stepMs: 1000 / 60, substeps: 3,
  speed: 3.75, acceleration: 0.65, releaseDrag: 0.82, jump: -4.3,
  playerGravity: 0.145, ballGravity: originalAcceleration(300),
  playerRadius: 22, ballRadius: 12, ballRestitution: 0.6, wallRestitution: 0,
  headRestitution: 0.01, bootRestitution: 1,
  ballFriction: 1, surfaceFriction: 0.5, headFriction: 0,
  restitutionVelocityThreshold: originalVelocity(1),
  serveY: 295, serveXSpeed: originalVelocity(150), serveYSpeed: originalVelocity(-100),
  bootRadius: 8, bootOrbit: 23, bootRestAngle: 1.05,
  bootRaiseTicks: 3, bootLowerTicks: 8, bootTapTicks: 6, bootMotionTransfer: 0.55,
  bootWidth: 16, bootHeight: 18, goalPauseTicks: 45,
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
  inputs: [Input, Input]; kicks: [number, number]; feet: [FootState, FootState]; ballRotation: number;
};
const { Engine, Bodies, Body, Composite, Query } = Matter;

// lift=0: reposo; lift=1: pie levantado. La órbita no atraviesa la cabeza.
// Dibujo y cuerpo sólido usan exactamente la misma posición.
export function bootPose(team: Team, lift: number) {
  const orbitAngle = RULES.bootRestAngle * (1 - lift);
  const side = team === 1 ? 1 : -1;
  return { x: side * Math.cos(orbitAngle) * RULES.bootOrbit, y: Math.sin(orbitAngle) * RULES.bootOrbit, angle: side * (-1.3 + lift * 1.8) };
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
  // El balón se integra fuera de Matter para conservar el contrato de
  // snapshots y resolver sus contactos de forma determinista en ambas casas.
  ball = Bodies.circle(512, RULES.serveY, RULES.ballRadius, { mass: 1, friction: RULES.ballFriction, frictionAir: 0, inertia: Infinity,
    collisionFilter: { category: COLLISION.ball, mask: 0 } });
  feet: [FootState, FootState] = [{ lift: 0, tapTicks: 0 }, { lift: 0, tapTicks: 0 }];
  boots = this.players.map(player => Bodies.circle(player.position.x, player.position.y, RULES.bootRadius, {
    isStatic: true, restitution: 0.15, friction: 0, frictionStatic: 0,
    collisionFilter: { category: COLLISION.foot, mask: COLLISION.head | COLLISION.ball, group: player.collisionFilter.group },
  }));
  ballRotation = 0;
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
    this.kicks = [-100, -100];
    this.feet = [{ lift: 0, tapTicks: 0 }, { lift: 0, tapTicks: 0 }];
    this.ballRotation = 0;
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
      Engine.update(this.engine, RULES.stepMs / RULES.substeps);
      this.syncBoots();
      this.resolveBootPair();
      this.stepBall();
      // The original ball is not fixed-rotation; integrate the contact spin
      // in the same target-tick units used by the explicit linear solver.
      this.ballRotation = (this.ballRotation + this.ball.angularVelocity / RULES.substeps) % (Math.PI * 2);
    }
    this.feet.forEach(foot => { foot.tapTicks = Math.max(0, foot.tapTicks - 1); });
    const { x, y } = this.ball.position;
    if (y > 480 && (x < 65 || x > 959)) {
      this.score[x < 65 ? 1 : 0]++;
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
    foot.lift = Math.max(0, Math.min(1, foot.lift + (raised ? rate : -rate)));
    const pose = bootPose(team, foot.lift), boot = this.boots[i];
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

  private stepBall() {
    const dt = 1 / RULES.substeps, radius = RULES.ballRadius;
    let { x, y } = this.ball.position;
    let vx = this.ball.velocity.x, vy = this.ball.velocity.y + RULES.ballGravity * dt;
    let spin = this.ball.angularVelocity;
    x += vx * dt; y += vy * dt;
    const contact = (nx: number, ny: number, depth: number, restitution: number, friction: number, ux = 0, uy = 0) => {
      x += nx * (depth + 0.000001); y += ny * (depth + 0.000001);
      const relative = (vx - ux) * nx + (vy - uy) * ny;
      if (relative >= 0) return;
      // Box2D only adds restitution above b2_velocityThreshold (1 source
      // unit/s); below it the contact removes the approach without a bounce.
      const impulse = -relative * (1 + (relative < -RULES.restitutionVelocityThreshold ? restitution : 0));
      vx += impulse * nx; vy += impulse * ny;
      // The original mixes friction as sqrt(ball * surface). Applying the
      // bounded tangent impulse keeps horizontal motion from being lost in
      // flight while allowing the floor and the boot to grip on contact.
      const tangentX = -ny, tangentY = nx;
      // For a circle I = m r² / 2, so the angular contribution to the
      // relative tangent speed is spin * radius and the angular impulse is
      // -2 * tangentImpulse / radius (mass is normalised to one here).
      const tangentVelocity = (vx - ux) * tangentX + (vy - uy) * tangentY - spin * radius;
      const tangentImpulse = Math.max(-friction * impulse, Math.min(friction * impulse, -tangentVelocity));
      vx += tangentImpulse * tangentX;
      vy += tangentImpulse * tangentY;
      spin -= 2 * tangentImpulse / radius;
    };
    const effectiveRestitution = (other: number) => Math.max(RULES.ballRestitution, other);
    const effectiveFriction = (other: number) => Math.sqrt(RULES.ballFriction * other);
    // Primero la bota: el rebote original sale de su velocidad y restitución,
    // no de un impulso fijo al pulsar la tecla.
    this.boots.forEach((boot) => {
      const hit = circleBox(x - boot.position.x, y - boot.position.y, radius, RULES.bootWidth / 2, RULES.bootHeight / 2);
      if (!hit) return;
      contact(hit.nx, hit.ny, hit.depth, effectiveRestitution(RULES.bootRestitution), effectiveFriction(RULES.surfaceFriction), boot.velocity.x, boot.velocity.y);
    });
    this.players.forEach((player, i) => {
      const dx = x - player.position.x, dy = y - player.position.y;
      const distance = Math.hypot(dx, dy), overlap = radius + RULES.playerRadius - distance;
      if (overlap <= 0) return;
      // Coincidencia exacta: normal estable, sin división por cero.
      const nx = distance > 0 ? dx / distance : i === 0 ? 1 : -1;
      const ny = distance > 0 ? dy / distance : 0;
      contact(nx, ny, overlap, effectiveRestitution(RULES.headRestitution), RULES.headFriction, player.velocity.x, player.velocity.y);
    });
    // Las barras conservan su inclinación visual: círculo contra caja en su espacio local.
    for (const [cx, angle] of [[40, 0.05], [984, -0.05]]) {
      const cos = Math.cos(angle), sin = Math.sin(angle), dx = x - cx, dy = y - 465;
      const hit = circleBox(dx * cos + dy * sin, -dx * sin + dy * cos, radius, 40, 2.5);
      if (hit) contact(hit.nx * cos - hit.ny * sin, hit.nx * sin + hit.ny * cos, hit.depth, effectiveRestitution(RULES.wallRestitution), effectiveFriction(RULES.surfaceFriction));
    }
    if (x < radius) contact(1, 0, radius - x, effectiveRestitution(RULES.wallRestitution), effectiveFriction(RULES.surfaceFriction));
    if (x > 1024 - radius) contact(-1, 0, x - (1024 - radius), effectiveRestitution(RULES.wallRestitution), effectiveFriction(RULES.surfaceFriction));
    if (y < radius) contact(0, 1, radius - y, effectiveRestitution(RULES.wallRestitution), effectiveFriction(RULES.surfaceFriction));
    if (y >= 590 - radius) {
      contact(0, -1, y - (590 - radius), RULES.ballRestitution, effectiveFriction(RULES.surfaceFriction));
      if (Math.abs(vy) < RULES.ballGravity * dt) vy = 0;
    }
    Body.setPosition(this.ball, { x, y });
    Body.setVelocity(this.ball, { x: vx, y: vy });
    Body.setAngularVelocity(this.ball, spin);
  }

  snapshot(): Snapshot {
    const body = (b: Matter.Body): BodyState => ({ x: b.position.x, y: b.position.y, vx: b.velocity.x, vy: b.velocity.y, angle: b.angle, spin: b.angularVelocity });
    return { tick: this.tick, round: this.round, pause: this.pause, score: [...this.score],
      match: this.match, remainingTicks: this.remainingTicks, ready: [...this.ready],
      players: [body(this.players[0]), body(this.players[1])], ball: body(this.ball),
      inputs: [{ ...this.inputs[0] }, { ...this.inputs[1] }], kicks: [...this.kicks],
      feet: [{ ...this.feet[0] }, { ...this.feet[1] }], ballRotation: this.ballRotation };
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
