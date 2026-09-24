import { test } from "node:test";
import assert from "node:assert/strict";
import Matter from "../client/node_modules/matter-js/build/matter.js";
import { Simulation, RULES, emptyInput } from "../client/src/game/simulation";
import { POWERUP_RULES } from "../client/src/game/powerups";

test("aparece cada ocho segundos, vence a los trece y se repone inmediatamente", () => {
  const sim = new Simulation("practice", 12345);
  try {
    const state = sim.snapshot();
    state.spawnClock = POWERUP_RULES.spawnTicks - 1;
    sim.restore(state);
    sim.step(emptyInput(), emptyInput());
    assert.equal(sim.powerups.length, 1);
    const first = sim.powerups[0];
    assert.equal(first.remainingTicks, POWERUP_RULES.lifeTicks);
    assert.ok(first.x >= 0 && first.x <= 1024 && first.y >= 0 && first.y <= 590);

    const expiring = sim.snapshot();
    expiring.spawnClock = 1;
    expiring.powerups[0].remainingTicks = 1;
    sim.restore(expiring);
    sim.step(emptyInput(), emptyInput());
    assert.equal(sim.powerups.length, 1);
    assert.notEqual(sim.powerups[0].id, first.id);
    assert.equal(sim.powerups[0].remainingTicks, POWERUP_RULES.lifeTicks);

    const full = sim.snapshot();
    full.powerups = [1, 2, 3].map((id, index) => ({ id: 100 + id, type: "jump-up" as const,
      x: 350 + index * 100, y: 150, remainingTicks: POWERUP_RULES.lifeTicks }));
    full.spawnClock = POWERUP_RULES.spawnTicks - 1;
    sim.restore(full);
    sim.step(emptyInput(), emptyInput());
    assert.equal(sim.powerups.length, 3);
  } finally { sim.destroy(); }
});

test("solo la pelota recoge, espera un último toque y la recolección no repone de inmediato", () => {
  const sim = new Simulation("practice", 44);
  try {
    const state = sim.snapshot();
    state.ball = { ...state.ball, x: 512, y: 300, vx: 0, vy: 0 };
    state.powerups = [{ id: 1, type: "speed-up", x: 512, y: 300, remainingTicks: POWERUP_RULES.lifeTicks }];
    state.spawnClock = 10;
    sim.restore(state);
    sim.step(emptyInput(), emptyInput());
    assert.equal(sim.powerups.length, 1);
    assert.equal(sim.effects.length, 0);

    const touched = sim.snapshot();
    touched.lastTouch = 2;
    touched.ball = { ...touched.ball, x: 512, y: 300, vx: 0, vy: 0 };
    sim.restore(touched);
    sim.step(emptyInput(), emptyInput());
    assert.equal(sim.powerups.length, 0);
    assert.deepEqual(sim.effects.map(effect => [effect.type, effect.target]), [["speed-up", 2]]);

    const due = sim.snapshot();
    due.spawnClock = POWERUP_RULES.spawnTicks - 1;
    sim.restore(due);
    sim.step(emptyInput(), emptyInput());
    assert.equal(sim.powerups.length, 1);
  } finally { sim.destroy(); }
});

test("cabeza y bota establecen el último toque", () => {
  for (const contact of ["head", "boot"]) {
    const sim = new Simulation("practice");
    try {
      const state = sim.snapshot();
      const dx = 512 - state.players[0].x, dy = 300 - state.players[0].y;
      state.players[0] = { ...state.players[0], x: 512, y: 300, vx: 0, vy: 0 };
      state.boots[0] = { ...state.boots[0], x: state.boots[0].x + dx, y: state.boots[0].y + dy, vx: 0, vy: 0 };
      const target = contact === "head" ? state.players[0] : state.boots[0];
      state.ball = { ...state.ball, x: target.x + (contact === "head" ? RULES.playerRadius + RULES.ballRadius - 2 : 13),
        y: target.y, vx: -2, vy: 0 };
      sim.restore(state);
      sim.step(emptyInput(), emptyInput());
      assert.equal(sim.lastTouch, 1, contact);
    } finally { sim.destroy(); }
  }
});

test("los efectos se asignan, se reemplazan y escalan colisiones y arcos", () => {
  const sim = new Simulation("practice");
  try {
    sim.grantPowerup("grow", 1);
    assert.equal(sim.playerScales[0], POWERUP_RULES.grow);
    assert.ok(Math.abs(sim.players[0].circleRadius - RULES.playerRadius * POWERUP_RULES.grow) < 0.01);
    assert.ok(Math.abs(sim.players[0].position.y + sim.players[0].circleRadius - (550 + RULES.playerRadius)) < 0.01);
    sim.grantPowerup("goal-big", 1);
    assert.equal(sim.goalScale(2), POWERUP_RULES.goalBig);
    assert.equal(sim.goalScale(1), 1);
    sim.grantPowerup("goal-small", 1);
    assert.equal(sim.goalScale(2), POWERUP_RULES.goalSmall);
    assert.equal(sim.effects.filter(effect => effect.target === 2 && effect.type.startsWith("goal")).length, 1);

    sim.effects.find(effect => effect.type === "grow")!.remainingTicks = 1;
    sim.step(emptyInput(), emptyInput());
    assert.equal(sim.playerScales[0], 1);
    assert.ok(Math.abs(sim.players[0].circleRadius - RULES.playerRadius) < 0.01);
    sim.grantPowerup("shrink", 1);
    assert.equal(sim.playerScales[0], POWERUP_RULES.shrink);
    sim.grantPowerup("shrink", 1);
    assert.equal(sim.effects.find(effect => effect.type === "shrink")!.remainingTicks, POWERUP_RULES.effectTicks);
  } finally { sim.destroy(); }
});

test("congelar detiene el movimiento y la patada, pero romper pierna no bloquea el movimiento", () => {
  const sim = new Simulation("practice");
  try {
    Matter.Body.setVelocity(sim.players[0], { x: 3, y: 0 });
    sim.grantPowerup("ice-self", 1);
    assert.equal(sim.players[0].velocity.x, 0);
    const pressed = { ...emptyInput(), direction: 1 as const, kick: 1, kickHeld: true };
    sim.step(pressed, emptyInput());
    assert.equal(sim.players[0].velocity.x, 0);
    assert.equal(sim.kicks[0], -100);
    for (let tick = 0; tick < 40; tick++) sim.step(emptyInput(), emptyInput());
    sim.step({ ...emptyInput(), jump: 1, direction: 1, kick: 2, kickHeld: true }, emptyInput());
    assert.ok(sim.players[0].velocity.y < -3, "congelado puede saltar");
    assert.equal(sim.players[0].velocity.x, 0);
    assert.equal(sim.kicks[0], -100);
    sim.grantPowerup("leg-opponent", 1);
    const moving = { ...emptyInput(), direction: 1 as const, kick: 1, kickHeld: true };
    sim.step(emptyInput(), moving);
    assert.ok(sim.players[1].velocity.x > 0);
    assert.equal(sim.kicks[1], -100);
  } finally { sim.destroy(); }
});

test("un gol limpia powerups y efectos; la instantánea conserva la secuencia aleatoria", () => {
  const host = new Simulation("practice", 987), guest = new Simulation("practice", 1);
  try {
    const state = host.snapshot();
    state.spawnClock = POWERUP_RULES.spawnTicks - 1;
    host.restore(state);
    host.step(emptyInput(), emptyInput());
    guest.restore(host.snapshot());
    for (let tick = 0; tick < 15; tick++) {
      host.step(emptyInput(), emptyInput());
      guest.step(emptyInput(), emptyInput());
    }
    assert.deepEqual(guest.powerups, host.powerups);
    assert.equal(guest.randomState, host.randomState);

    host.grantPowerup("jump-up", 1);
    Matter.Body.setPosition(host.ball, { x: 40, y: 560 });
    host.step(emptyInput(), emptyInput());
    assert.equal(host.round, 1);
    assert.deepEqual(host.powerups, []);
    assert.deepEqual(host.effects, []);
    assert.equal(host.spawnClock, 0);
    assert.equal(host.lastTouch, null);
  } finally { host.destroy(); guest.destroy(); }
});

test("velocidad y salto usan sus multiplicadores ajustables", () => {
  const sim = new Simulation("practice");
  try {
    sim.grantPowerup("speed-up", 1);
    const run = { ...emptyInput(), direction: 1 as const };
    for (let tick = 0; tick < 20; tick++) sim.step(run, emptyInput());
    assert.ok(Math.abs(sim.players[0].velocity.x - RULES.speed * POWERUP_RULES.speedUp) < 0.05);
    sim.grantPowerup("speed-down", 1);
    sim.step(run, emptyInput());
    assert.ok(sim.players[0].velocity.x <= RULES.speed * POWERUP_RULES.speedDown + 0.01);
    assert.equal(sim.effects.filter(effect => effect.target === 1 && effect.type.startsWith("speed")).length, 1);

    sim.grantPowerup("jump-up", 1);
    for (let tick = 0; tick < 40; tick++) sim.step(emptyInput(), emptyInput());
    const jump = { ...emptyInput(), jump: 1 };
    sim.step(jump, emptyInput());
    assert.ok(sim.players[0].velocity.y < RULES.jump * POWERUP_RULES.jumpUp + 0.3);
  } finally { sim.destroy(); }
});

test("el alto del arco cambia la zona donde cuenta un gol", () => {
  const normal = new Simulation("practice"), big = new Simulation("practice"), small = new Simulation("practice");
  try {
    big.grantPowerup("goal-big", 1);
    small.grantPowerup("goal-small", 1);
    for (const sim of [normal, big]) {
      Matter.Body.setPosition(sim.ball, { x: 980, y: 420 });
      Matter.Body.setVelocity(sim.ball, { x: 0, y: 0 });
      sim.step(emptyInput(), emptyInput());
    }
    assert.equal(normal.score[0], 0);
    assert.equal(big.score[0], 1);

    Matter.Body.setPosition(small.ball, { x: 980, y: 470 });
    Matter.Body.setVelocity(small.ball, { x: 0, y: 0 });
    small.step(emptyInput(), emptyInput());
    assert.equal(small.score[0], 0);
  } finally { normal.destroy(); big.destroy(); small.destroy(); }
});

test("crecer ralentiza la patada y el invitado restaura tamaño y efecto sin divergir", () => {
  const host = new Simulation("practice", 111), guest = new Simulation("practice", 222);
  try {
    const normal = new Simulation("practice");
    try {
      host.grantPowerup("grow", 1);
      const kick = { ...emptyInput(), kick: 1, kickHeld: true };
      host.step(kick, emptyInput());
      normal.step(kick, emptyInput());
      assert.ok(host.feet[0].lift < normal.feet[0].lift);
    } finally { normal.destroy(); }

    host.grantPowerup("goal-big", 1);
    guest.restore(host.snapshot());
    for (let tick = 0; tick < 30; tick++) {
      const input = { ...emptyInput(), direction: 1 as const, kick: 1, kickHeld: true };
      host.step(input, emptyInput());
      guest.step(input, emptyInput());
    }
    assert.deepEqual(guest.effects, host.effects);
    assert.deepEqual(guest.playerScales, host.playerScales);
    assert.ok(Math.abs(guest.players[0].position.x - host.players[0].position.x) < 0.1);
    assert.ok(Math.abs(guest.boots[0].position.x - host.boots[0].position.x) < 0.1);
  } finally { host.destroy(); guest.destroy(); }
});
