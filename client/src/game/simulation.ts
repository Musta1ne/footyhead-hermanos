import Matter from "matter-js";
import { ARENA_SLOPES, PITCH_FLOOR_Y, REFERENCE_VISUALS, VISUAL_SCALE } from "./visual-proportions";
import type { MatchMode } from "./match-mode";
import { POWERUP_RULES, POWERUP_TYPES, effectGroup, type ActiveEffect, type Powerup, type PowerupType } from "./powerups";

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
  maxRollSpeed: 2.5, rollLimitDelayMs: 150, rollVerticalTolerance: 0.05, rollHorizontalTolerance: 0.01,
  maxBallSpeed: 10.5, serveY: 295, serveXSpeed: 2.5, serveYSpeed: -1.8,
  bootRadius: 8 * VISUAL_SCALE, bootOrbit: 27 * VISUAL_SCALE, bootRestAngle: 1.05,
  bootMass: 2.4, bootRaiseTicks: 12, bootLowerTicks: 12, bootTapTicks: 9,
  bootSpring: 0.34, bootSpringDamping: 0.16,
  bootWidth: 16 * VISUAL_SCALE, bootHeight: 18 * VISUAL_SCALE,
  goalWidth: REFERENCE_VISUALS.goal.width * VISUAL_SCALE,
  goalTop: PITCH_FLOOR_Y - REFERENCE_VISUALS.goal.height * VISUAL_SCALE,
  goalScoreX: 65 * VISUAL_SCALE, goalScoreY: PITCH_FLOOR_Y - (590 - 480) * VISUAL_SCALE,
  goalPauseTicks: 45,
  headRestitution: 0.4, bootRestitution: 0.45,
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
  match: number; mode: MatchMode; remainingTicks: number; winner: Team | null; ready: [boolean, boolean];
  players: [BodyState, BodyState]; ball: BodyState;
  inputs: [Input, Input]; kicks: [number, number]; feet: [FootState, FootState];
  boots: [BodyState, BodyState]; ballRotation: number; ballRollMs: number;
  roofSlide: [boolean, boolean];
  powerups: Powerup[]; effects: ActiveEffect[]; lastTouch: Team | null;
  spawnClock: number; nextPowerupId: number; randomState: number; playerScales: [number, number];
};
const { Engine, Bodies, Body, Composite, Constraint, Query } = Matter;

// lift=0: reposo; lift=1: pie levantado. La órbita no atraviesa la cabeza.
// Dibujo y cuerpo sólido usan exactamente la misma posición.
export function bootPose(team: Team, lift: number, scale = 1) {
  // La referencia original barre desde atrás y abajo del cuerpo hasta delante,
  // a la altura de su centro; ambos lados usan exactamente el mismo espejo.
  const orbitAngle = RULES.bootRestAngle + (Math.PI - RULES.bootRestAngle) * lift;
  const side = team === 1 ? 1 : -1;
  return { x: -side * Math.cos(orbitAngle) * RULES.bootOrbit * scale, y: Math.sin(orbitAngle) * RULES.bootOrbit * scale, angle: side * (-1.3 - (Math.PI - RULES.bootRestAngle) * lift) };
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
  readonly mode: MatchMode;
  engine = Engine.create({
    gravity: { x: 0, y: 1, scale: RULES.ballGravity / RULES.stepMs ** 2 },
    positionIterations: 10, velocityIterations: 6, constraintIterations: 2,
  });
  players = [200, 824].map(x => Bodies.circle(x, 550, RULES.playerRadius, { mass: 20, restitution: 0, friction: 0, frictionAir: 0, inertia: Infinity,
    collisionFilter: { category: COLLISION.head, group: Body.nextGroup(true) } }));
  // Sin torque físico: la rotación visual no modifica la normal de rebote.
  // El círculo mantiene su orientación; la pelota puede rodar sin frenarse.
  // Contenedor de estado compatible con snapshots; no se integra en Matter.
  ball = Bodies.circle(512, RULES.serveY, RULES.ballRadius, { mass: 1, frictionAir: 0, inertia: Infinity,
    collisionFilter: { category: COLLISION.ball, mask: 0 } });
  feet: [FootState, FootState] = [{ lift: 0, tapTicks: 0 }, { lift: 0, tapTicks: 0 }];
  boots = this.players.map((player, i) => {
    const pose = bootPose(i === 0 ? 1 : 2, 0);
    const boot = Bodies.rectangle(player.position.x + pose.x, player.position.y + pose.y,
      RULES.bootWidth, RULES.bootHeight, {
        angle: pose.angle, mass: RULES.bootMass, restitution: RULES.bootRestitution,
        friction: 0, frictionStatic: 0, frictionAir: 0,
        // Lift is a pose target, not a collision switch. Keep all physical
        // contacts enabled while a boot sweeps up or down.
        collisionFilter: { category: COLLISION.foot, mask: COLLISION.head | COLLISION.foot | COLLISION.ball, group: player.collisionFilter.group },
      });
    // The boot rotates around its pin, so use the parallel-axis inertia of
    // the rigid body about that pivot rather than only Icom. This keeps the
    // finite-mass pin stable while preserving physical angular yielding.
    Body.setInertia(boot, boot.inertia + boot.mass * RULES.bootOrbit ** 2);
    return boot;
  });
  bootPivots = this.boots.map((boot, i) => {
    const pose = bootPose(i === 0 ? 1 : 2, 0);
    const pivot = { x: -pose.x, y: -pose.y };
    return Constraint.create({
      bodyA: this.players[i], bodyB: boot, pointA: { x: 0, y: 0 },
      // Matter stores constraint anchors in world-relative coordinates and
      // rotates them as the body angle changes; do not pre-rotate this pivot.
      pointB: pivot,
      length: 0, stiffness: 1, damping: 0.01,
    });
  });
  ballRotation = 0;
  ballRollMs = 0;
  roofSlide: [boolean, boolean] = [false, false];
  powerups: Powerup[] = [];
  effects: ActiveEffect[] = [];
  lastTouch: Team | null = null;
  spawnClock = 0;
  nextPowerupId = 1;
  randomState: number;
  playerScales: [number, number] = [1, 1];
  private goalRoofs = [
    Bodies.rectangle(RULES.goalWidth / 2, RULES.goalTop, RULES.goalWidth, 5 * VISUAL_SCALE, { isStatic: true, angle: 0.05, restitution: RULES.wallRestitution }),
    Bodies.rectangle(1024 - RULES.goalWidth / 2, RULES.goalTop, RULES.goalWidth, 5 * VISUAL_SCALE, { isStatic: true, angle: -0.05, restitution: RULES.wallRestitution }),
  ];
  tick = 0;
  match = 0;
  remainingTicks: number;
  ready: [boolean, boolean] = [false, false];
  winner: Team | null = null;
  get finished() { return this.winner !== null; }
  get goldenGoal() { return this.mode === "timed" && this.remainingTicks === 0 && !this.finished && this.score[0] === this.score[1]; }
  goalScale(team: Team) {
    const type = this.effects.find(effect => effect.target === team && effectGroup(effect.type) === "goal")?.type;
    return type === "goal-big" ? POWERUP_RULES.goalBig : type === "goal-small" ? POWERUP_RULES.goalSmall : 1;
  }
  goalTop(team: Team) { return PITCH_FLOOR_Y - REFERENCE_VISUALS.goal.height * VISUAL_SCALE * this.goalScale(team); }
  private goalScoreY(team: Team) { return this.goalTop(team) + (RULES.goalScoreY - RULES.goalTop); }
  private effectFor(team: Team, group: ReturnType<typeof effectGroup>) {
    return this.effects.find(effect => effect.target === team && effectGroup(effect.type) === group)?.type;
  }
  private playerSpeed(team: Team) {
    const type = this.effectFor(team, "speed");
    return RULES.speed * (type === "speed-up" ? POWERUP_RULES.speedUp : type === "speed-down" ? POWERUP_RULES.speedDown : 1);
  }
  private playerJump(team: Team) {
    const type = this.effectFor(team, "jump");
    return RULES.jump * (type === "jump-up" ? POWERUP_RULES.jumpUp : type === "jump-down" ? POWERUP_RULES.jumpDown : 1);
  }
  private frozen(team: Team) { return this.effectFor(team, "ice") !== undefined; }
  private cannotKick(team: Team) { return this.frozen(team) || this.effectFor(team, "leg") !== undefined; }

  private resolveTimedWinner() {
    if (this.finished || this.mode !== "timed" || this.remainingTicks !== 0 || this.score[0] === this.score[1]) return;
    this.winner = this.score[0] > this.score[1] ? 1 : 2;
    this.clearPowerupsAndEffects();
  }

  requestRematch(team: Team, match: number) {
    if (!this.finished || match !== this.match || this.ready[team - 1]) return false;
    this.ready[team - 1] = true;
    // El tick global también ordena estados enviados por canales diferentes.
    this.tick++;
    if (this.ready.every(Boolean)) {
      this.match++;
      this.remainingTicks = this.mode === "timed" ? RULES.matchTicks : 0;
      this.winner = null;
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

  constructor(mode: MatchMode = "timed", seed = 1) {
    this.mode = mode;
    this.randomState = seed >>> 0 || 1;
    this.remainingTicks = mode === "timed" ? RULES.matchTicks : 0;
    Composite.add(this.engine.world, [
      ...this.players, ...this.boots, ...this.bootPivots,
      Bodies.rectangle(-10, 300, 20, 768, { isStatic: true, restitution: RULES.wallRestitution }),
      Bodies.rectangle(1034, 300, 20, 768, { isStatic: true, restitution: RULES.wallRestitution }),
      Bodies.rectangle(512, -10, 1024, 20, { isStatic: true, restitution: RULES.wallRestitution }),
      Bodies.rectangle(512, 600, 1024, 20, { isStatic: true, friction: 0.3 }),
      ...this.goalRoofs,
    ]);
    this.serve();
  }

  private serve() {
    this.clearPowerupsAndEffects();
    this.players.forEach((p, i) => {
      Body.setPosition(p, { x: i === 0 ? 200 : 824, y: 550 });
      Body.setVelocity(p, { x: 0, y: 0 });
      Body.setAngularVelocity(p, 0);
    });
    this.boots.forEach((boot, i) => {
      const pose = bootPose(i === 0 ? 1 : 2, 0), player = this.players[i];
      Body.setPosition(boot, { x: player.position.x + pose.x, y: player.position.y + pose.y });
      Body.setAngle(boot, pose.angle);
      Body.setVelocity(boot, { x: 0, y: 0 });
      Body.setAngularVelocity(boot, 0);
    });
    Body.setPosition(this.ball, { x: 512, y: RULES.serveY });
    Body.setVelocity(this.ball, { x: this.round % 2 ? -RULES.serveXSpeed : RULES.serveXSpeed, y: RULES.serveYSpeed });
    Body.setAngularVelocity(this.ball, 0);
    this.kicks = [-100, -100];
    this.feet = [{ lift: 0, tapTicks: 0 }, { lift: 0, tapTicks: 0 }];
    this.ballRotation = 0;
    this.ballRollMs = 0;
    this.roofSlide = [false, false];
    this.rebuildBootPivots();
    // No reutilizar contactos de la posición anterior después de un gol.
    this.resetCollisions();
  }

  private clearPowerupsAndEffects() {
    this.powerups = [];
    this.effects = [];
    this.lastTouch = null;
    this.spawnClock = 0;
    this.players.forEach((_, i) => this.resizePlayer(i, 1));
    this.updateGoalRoofs();
  }

  private resizePlayer(index: number, scale: number) {
    const previous = this.playerScales[index];
    if (previous === scale) return;
    const ratio = scale / previous;
    const player = this.players[index], boot = this.boots[index];
    const bottom = player.position.y + RULES.playerRadius * previous;
    const bootOffset = { x: boot.position.x - player.position.x, y: boot.position.y - player.position.y };
    Body.scale(player, ratio, ratio);
    Body.scale(boot, ratio, ratio);
    Body.setPosition(player, { x: player.position.x, y: bottom - RULES.playerRadius * scale });
    Body.setPosition(boot, { x: player.position.x + bootOffset.x * ratio, y: player.position.y + bootOffset.y * ratio });
    this.playerScales[index] = scale;
    this.rebuildBootPivots();
    this.resetCollisions();
  }

  private updateGoalRoofs() {
    this.goalRoofs.forEach((roof, i) => Body.setPosition(roof, { x: roof.position.x, y: this.goalTop(i === 0 ? 1 : 2) }));
  }

  grantPowerup(type: PowerupType, collector: Team) {
    const target: Team = type === "ice-opponent" || type === "leg-opponent" || type.startsWith("goal-")
      ? (collector === 1 ? 2 : 1) : collector;
    const group = effectGroup(type);
    this.effects = this.effects.filter(effect => effect.target !== target || effectGroup(effect.type) !== group);
    this.effects.push({ type, target, remainingTicks: POWERUP_RULES.effectTicks });
    if (group === "size") this.resizePlayer(target - 1, type === "grow" ? POWERUP_RULES.grow : POWERUP_RULES.shrink);
    if (group === "goal") this.updateGoalRoofs();
    if (group === "ice") Body.setVelocity(this.players[target - 1], { x: 0, y: this.players[target - 1].velocity.y });
    if (group === "ice" || group === "leg") this.feet[target - 1].tapTicks = 0;
  }

  private advanceEffects() {
    const expired = this.effects.filter(effect => effect.remainingTicks <= 1);
    this.effects = this.effects.filter(effect => effect.remainingTicks > 1).map(effect => ({ ...effect, remainingTicks: effect.remainingTicks - 1 }));
    for (const effect of expired) {
      if (effectGroup(effect.type) === "size") this.resizePlayer(effect.target - 1, 1);
      if (effectGroup(effect.type) === "goal") this.updateGoalRoofs();
    }
  }

  private random() {
    let value = this.randomState;
    value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
    this.randomState = value >>> 0 || 1;
    return this.randomState / 0x100000000;
  }

  private spawnPowerup() {
    if (this.powerups.length >= POWERUP_RULES.maxVisible) return;
    const radius = POWERUP_RULES.radius;
    const minX = radius + 5, maxX = 1024 - minX;
    const minY = radius + 8, maxY = PITCH_FLOOR_Y - radius - 8;
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = minX + this.random() * (maxX - minX), y = minY + this.random() * (maxY - minY);
      const clear = (body: Matter.Body, distance: number) => Math.hypot(x - body.position.x, y - body.position.y) > distance;
      const insideArena = ARENA_SLOPES.every(([start, end]) => {
        const dx = end.x - start.x, dy = end.y - start.y;
        return ((x - start.x) * dy - (y - start.y) * dx) / Math.hypot(dx, dy) >= radius + 5;
      });
      if ((x < RULES.goalWidth + radius && y < this.goalTop(1) + radius + 5)
        || (x > 1024 - RULES.goalWidth - radius && y < this.goalTop(2) + radius + 5)
        || !insideArena
        || (x > 365 && x < 659 && y > 175 && y < 245)
        || (x > 430 && x < 594 && y < 65)
        || !clear(this.ball, radius + RULES.ballRadius + 5)
        || this.players.some((body, i) => !clear(body, radius + RULES.playerRadius * this.playerScales[i] + 5))
        || this.boots.some((body, i) => !clear(body, radius + Math.hypot(RULES.bootWidth, RULES.bootHeight) * this.playerScales[i] / 2 + 5))
        || this.powerups.some(item => Math.hypot(x - item.x, y - item.y) < radius * 2 + 5)) continue;
      const type = POWERUP_TYPES[Math.floor(this.random() * POWERUP_TYPES.length)];
      this.powerups.push({ id: this.nextPowerupId++, type, x, y, remainingTicks: POWERUP_RULES.lifeTicks });
      return;
    }
  }

  private advancePowerups() {
    const expired = this.powerups.filter(item => item.remainingTicks <= 1).length;
    this.powerups = this.powerups.filter(item => item.remainingTicks > 1).map(item => ({ ...item, remainingTicks: item.remainingTicks - 1 }));
    for (let i = 0; i < expired; i++) this.spawnPowerup();
    this.spawnClock++;
    if (this.spawnClock >= POWERUP_RULES.spawnTicks) {
      this.spawnClock = 0;
      this.spawnPowerup();
    }
  }

  private collectPowerups() {
    if (this.lastTouch === null) return;
    const radius = RULES.ballRadius + POWERUP_RULES.radius;
    const remaining: Powerup[] = [];
    for (const item of this.powerups) {
      if (Math.hypot(this.ball.position.x - item.x, this.ball.position.y - item.y) <= radius) this.grantPowerup(item.type, this.lastTouch);
      else remaining.push(item);
    }
    this.powerups = remaining;
  }

  step(one: Input, two: Input) {
    if (this.finished) return;
    this.tick++;
    if (this.mode === "timed" && this.remainingTicks > 0) this.remainingTicks--;
    this.clearConstraintWarmth();
    const next = [one, two];
    if (this.pause > 0) {
      this.inputs = [{ ...one }, { ...two }];
      this.pause--;
      this.resolveTimedWinner();
      if (this.pause === 0 && !this.finished) this.serve();
      return;
    }
    next.forEach((input, i) => {
      const player = this.players[i];
      const team: Team = i === 0 ? 1 : 2;
      const speed = this.playerSpeed(team);
      const acceleration = RULES.acceleration * speed / RULES.speed;
      const target = input.direction * speed;
      let vx = this.frozen(team) ? 0 : input.direction === 0 ? player.velocity.x * RULES.releaseDrag
        : player.velocity.x + Math.max(-acceleration, Math.min(acceleration, target - player.velocity.x));
      vx = Math.max(-speed, Math.min(speed, vx));
      if (Math.abs(vx) < 0.03) vx = 0;
      Body.setVelocity(player, { x: vx, y: player.velocity.y });
      if ((input.jump > this.inputs[i].jump || input.jumpHeld) && this.supported(player)) {
        const jump = this.playerJump(team);
        Body.setVelocity(player, { x: player.velocity.x, y: jump });
        // Launch the attached finite-mass boot with the same delta-V. The
        // pin then keeps the pair together without stealing the jump impulse.
        Body.setVelocity(this.boots[i], {
          x: this.boots[i].velocity.x,
          y: this.boots[i].velocity.y + jump,
        });
      }
      // Al apoyar sobre el travesaño, el jugador sigue deslizándose hacia la
      // cancha hasta salir del borde y caer, aunque mantenga dirección a la pared.
      const leftGoal = player.position.x < 512;
      const goalEdge = leftGoal ? RULES.goalWidth : 1024 - RULES.goalWidth;
      const slide = leftGoal ? 1 : -1;
      const center = leftGoal ? RULES.goalWidth / 2 : 1024 - RULES.goalWidth / 2;
      const angle = leftGoal ? 0.05 : -0.05;
      const goalTop = this.goalTop(leftGoal ? 1 : 2);
      const playerRadius = RULES.playerRadius * this.playerScales[i];
      const roofY = goalTop + Math.tan(angle) * (player.position.x - center) - 2.5 * VISUAL_SCALE / Math.cos(angle);
      if (player.velocity.y < -2 || player.position.y > goalTop + playerRadius) {
        this.roofSlide[i] = false;
      } else if ((player.position.x - goalEdge) * slide <= playerRadius
        && Math.abs(player.position.y + playerRadius - roofY) < 5
        && Math.abs(player.velocity.y) < 0.75) {
        this.roofSlide[i] = true;
      }
      if (this.roofSlide[i] && player.velocity.x * slide < 2.5) {
        Body.setVelocity(player, { x: slide * 2.5, y: player.velocity.y });
      }
      if (!this.cannotKick(team) && (input.kick > this.inputs[i].kick || (input.kickHeld && !this.inputs[i].kickHeld))) {
        this.kicks[i] = this.tick;
        // Una pulsación que ocurrió entre dos fotogramas sigue siendo útil.
        // Una tecla sostenida, en cambio, baja apenas llega su liberación.
        this.feet[i].tapTicks = input.kickHeld ? 0 : RULES.bootTapTicks;
      }
    });
    this.inputs = [{ ...one }, { ...two }];
    for (let substep = 0; substep < RULES.substeps; substep++) {
      const frozenX = this.players.map((player, i) => this.frozen(i === 0 ? 1 : 2) ? player.position.x : null);
      this.players.forEach((player, i) => {
        Body.applyForce(player, player.position, { x: 0, y: player.mass * (RULES.playerGravity - RULES.ballGravity) / RULES.stepMs ** 2 });
        this.moveBoot(i, !this.cannotKick(i === 0 ? 1 : 2) && (next[i].kickHeld || this.feet[i].tapTicks > 0));
      });
      this.limitBallSpeed();
      Engine.update(this.engine, RULES.stepMs / RULES.substeps);
      this.players.forEach((player, i) => {
        if (frozenX[i] === null) return;
        Body.setPosition(player, { x: frozenX[i]!, y: player.position.y });
        Body.setVelocity(player, { x: 0, y: player.velocity.y });
      });
      this.limitBallSpeed();
      this.ballRotation = (this.ballRotation + this.ball.velocity.x / RULES.ballRadius / RULES.substeps) % (Math.PI * 2);
      this.stepBall();
    }
    this.players.forEach((player, i) => {
      const team: Team = i === 0 ? 1 : 2;
      if (!this.effectFor(team, "speed")) return;
      const speed = this.playerSpeed(team);
      if (Math.abs(player.velocity.x) > speed) Body.setVelocity(player, {
        x: Math.sign(player.velocity.x) * speed, y: player.velocity.y,
      });
    });
    this.feet.forEach(foot => { foot.tapTicks = Math.max(0, foot.tapTicks - 1); });
    const { x, y } = this.ball.position;
    const scoringGoal: Team | null = x < RULES.goalScoreX ? 1 : x > 1024 - RULES.goalScoreX ? 2 : null;
    if (scoringGoal && y > this.goalScoreY(scoringGoal)) {
      const scorer: Team = x < RULES.goalScoreX ? 2 : 1;
      this.score[scorer - 1]++;
      this.round++;
      this.resolveTimedWinner();
      if (this.mode === "first-to-seven" && this.score[scorer - 1] >= 7) {
        this.winner = scorer;
      } else if (!this.finished) {
        this.pause = RULES.goalPauseTicks;
      }
      this.clearPowerupsAndEffects();
    } else {
      this.advanceEffects();
      this.collectPowerups();
      this.advancePowerups();
    }
    this.resolveTimedWinner();
  }

  private supported(player: Matter.Body) {
    if (Math.abs(player.velocity.y) > 0.75) return false;
    const surfaces = Composite.allBodies(this.engine.world).filter(body => body !== player && body !== this.ball
      && !this.goalRoofs.includes(body)
      && body.collisionFilter.group !== player.collisionFilter.group && body.bounds.min.y > player.position.y);
    const foot = { x: player.position.x, y: player.bounds.max.y - 1 };
    return Query.ray(surfaces, foot, { x: foot.x, y: foot.y + 3 }, 4).length > 0;
  }

  private moveBoot(i: number, raised: boolean) {
    const team = i === 0 ? 1 : 2, foot = this.feet[i], boot = this.boots[i];
    const duration = this.playerScales[i] > 1 ? POWERUP_RULES.bigKickDuration : 1;
    const rate = 1 / ((raised ? RULES.bootRaiseTicks : RULES.bootLowerTicks) * RULES.substeps * duration);
    foot.lift = Math.max(0, Math.min(1, foot.lift + (raised ? rate : -rate)));
    const target = bootPose(team, foot.lift).angle;
    const error = Number.isFinite(boot.angle)
      ? Math.atan2(Math.sin(target - boot.angle), Math.cos(target - boot.angle))
      : 0;
    const angularAcceleration = RULES.bootSpring * error - RULES.bootSpringDamping * boot.angularVelocity;
    boot.torque += boot.inertia * angularAcceleration / (RULES.stepMs * RULES.stepMs);
    Body.applyForce(boot, boot.position, { x: 0, y: boot.mass * (RULES.playerGravity - RULES.ballGravity) / RULES.stepMs ** 2 });
  }

  private rebuildBootPivots() {
    this.boots.forEach((boot, i) => {
      const rest = bootPose(i === 0 ? 1 : 2, 0, this.playerScales[i]);
      const delta = boot.angle - rest.angle;
      const offset = { x: -rest.x, y: -rest.y };
      const cos = Math.cos(delta), sin = Math.sin(delta);
      const pivot = this.bootPivots[i] as Matter.Constraint & { angleA: number; angleB: number };
      pivot.pointB = { x: offset.x * cos - offset.y * sin, y: offset.x * sin + offset.y * cos };
      pivot.angleB = boot.angle;
      pivot.angleA = this.players[i].angle;
    });
  }

  private clearConstraintWarmth() {
    [...this.players, ...this.boots].forEach(body => {
      const warm = (body as Matter.Body & { constraintImpulse: { x: number; y: number; angle: number } }).constraintImpulse;
      warm.x = 0;
      warm.y = 0;
      warm.angle = 0;
    });
  }

  private limitBallSpeed() {
    const speed = Math.hypot(this.ball.velocity.x, this.ball.velocity.y);
    if (speed > RULES.maxBallSpeed) Body.setVelocity(this.ball, { x: this.ball.velocity.x * RULES.maxBallSpeed / speed, y: this.ball.velocity.y * RULES.maxBallSpeed / speed });
  }

  private stepBall() {
    const dt = 1 / RULES.substeps, radius = RULES.ballRadius;
    let { x, y } = this.ball.position;
    const previous = { x, y };
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
    this.boots.forEach((boot, i) => {
      const cos = Math.cos(boot.angle), sin = Math.sin(boot.angle);
      const dx = x - boot.position.x, dy = y - boot.position.y;
      const hit = circleBox(dx * cos + dy * sin, -dx * sin + dy * cos, radius,
        RULES.bootWidth * this.playerScales[i] / 2, RULES.bootHeight * this.playerScales[i] / 2);
      if (!hit) return;
      this.lastTouch = i === 0 ? 1 : 2;
      const nx = hit.nx * cos - hit.ny * sin, ny = hit.nx * sin + hit.ny * cos;
      x += nx * (hit.depth + 0.000001); y += ny * (hit.depth + 0.000001);
      const point = { x: x - nx * radius, y: y - ny * radius };
      const lever = { x: point.x - boot.position.x, y: point.y - boot.position.y };
      const bootVx = boot.velocity.x - boot.angularVelocity * lever.y;
      const bootVy = boot.velocity.y + boot.angularVelocity * lever.x;
      const relative = (vx - bootVx) * nx + (vy - bootVy) * ny;
      if (relative >= 0) return;
      const leverNormal = lever.x * ny - lever.y * nx;
      const denominator = 1 + boot.inverseMass + leverNormal * leverNormal * boot.inverseInertia;
      const impulse = -(1 + RULES.bootRestitution) * relative / denominator;
      vx += impulse * nx; vy += impulse * ny;
      Body.setVelocity(boot, {
        x: boot.velocity.x - impulse * nx * boot.inverseMass,
        y: boot.velocity.y - impulse * ny * boot.inverseMass,
      });
      Body.setAngularVelocity(boot, boot.angularVelocity - leverNormal * impulse * boot.inverseInertia);
    });
    this.players.forEach((player, i) => {
      const dx = x - player.position.x, dy = y - player.position.y;
      const distance = Math.hypot(dx, dy), overlap = radius + RULES.playerRadius * this.playerScales[i] - distance;
      if (overlap <= 0) return;
      this.lastTouch = i === 0 ? 1 : 2;
      // Coincidencia exacta: normal estable, sin división por cero.
      const nx = distance > 0 ? dx / distance : i === 0 ? 1 : -1;
      const ny = distance > 0 ? dy / distance : 0;
      contact(nx, ny, overlap, RULES.headRestitution, player.velocity.x, player.velocity.y);
    });
    // Las barras conservan su inclinación visual: círculo contra caja en su espacio local.
    for (const [index, cx, angle] of [[0, RULES.goalWidth / 2, 0.05], [1, 1024 - RULES.goalWidth / 2, -0.05]]) {
      const goalTop = this.goalTop(index === 0 ? 1 : 2);
      const cos = Math.cos(angle), sin = Math.sin(angle), dx = x - cx, dy = y - goalTop;
      const localX = dx * cos + dy * sin;
      const previousAbove = (previous.x - cx) * sin - (previous.y - goalTop) * cos >= 0;
      if (previousAbove && Math.abs(localX) <= RULES.goalWidth / 2) {
        // Una cabeza puede empujar la pelota más allá del centro de la barra
        // en este subpaso. Conservar la cara de entrada impide que la caja
        // la expulse por debajo y produzca un gol desde arriba.
        const depth = radius + 2.5 * VISUAL_SCALE - (dx * sin - dy * cos);
        if (depth > 0) contact(sin, -cos, depth, RULES.wallRestitution);
        continue;
      }
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
      match: this.match, mode: this.mode, remainingTicks: this.remainingTicks, winner: this.winner, ready: [...this.ready],
      players: [body(this.players[0]), body(this.players[1])], ball: body(this.ball),
      inputs: [{ ...this.inputs[0] }, { ...this.inputs[1] }], kicks: [...this.kicks],
      feet: [{ ...this.feet[0] }, { ...this.feet[1] }], boots: [body(this.boots[0]), body(this.boots[1])],
      ballRotation: this.ballRotation, ballRollMs: this.ballRollMs, roofSlide: [...this.roofSlide],
      powerups: this.powerups.map(item => ({ ...item })), effects: this.effects.map(effect => ({ ...effect })),
      lastTouch: this.lastTouch, spawnClock: this.spawnClock, nextPowerupId: this.nextPowerupId,
      randomState: this.randomState, playerScales: [...this.playerScales] };
  }

  restore(state: Snapshot) {
    const body = (b: Matter.Body, s: BodyState) => {
      Body.setPosition(b, { x: s.x, y: s.y });
      Body.setAngle(b, s.angle);
      Body.setVelocity(b, { x: s.vx, y: s.vy });
      Body.setAngularVelocity(b, s.spin);
    };
    this.tick = state.tick; this.round = state.round; this.pause = state.pause;
    this.match = state.match; this.remainingTicks = state.remainingTicks; this.winner = state.winner; this.ready = [...state.ready];
    this.score = [...state.score]; this.inputs = state.inputs.map(i => ({ ...i })) as [Input, Input];
    this.kicks = [...state.kicks];
    this.feet = [{ ...state.feet[0] }, { ...state.feet[1] }];
    this.ballRotation = state.ballRotation;
    this.ballRollMs = state.ballRollMs;
    this.roofSlide = [...state.roofSlide];
    this.powerups = state.powerups.map(item => ({ ...item }));
    this.effects = state.effects.map(effect => ({ ...effect }));
    this.lastTouch = state.lastTouch;
    this.spawnClock = state.spawnClock;
    this.nextPowerupId = state.nextPowerupId;
    this.randomState = state.randomState;
    this.players.forEach((_, i) => this.resizePlayer(i, state.playerScales[i]));
    this.updateGoalRoofs();
    this.players.forEach((p, i) => body(p, state.players[i]));
    this.boots.forEach((boot, i) => body(boot, state.boots[i]));
    body(this.ball, state.ball);
    this.rebuildBootPivots();
    this.resetCollisions();
  }

  private resetCollisions() {
    Engine.clear(this.engine);
    this.clearConstraintWarmth();
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
