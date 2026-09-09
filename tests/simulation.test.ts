import { test } from "node:test";
import assert from "node:assert/strict";
import Matter from "../client/node_modules/matter-js/build/matter.js";
import { Simulation, emptyInput, RULES, isInput } from "../client/src/game/simulation";

test("mover y saltar responde en el primer paso, sin una respuesta de red", () => {
  const sim = new Simulation();
  const one = emptyInput(), two = emptyInput();
  for (let i = 0; i < 30; i++) sim.step(one, two);
  const before = sim.players[0].position.x;
  one.direction = 1; one.jump++;
  sim.step(one, two);
  assert.ok(sim.players[0].position.x > before + 3);
  assert.ok(sim.players[0].velocity.y < -5);
  one.direction = 0;
  sim.step(one, two);
  assert.ok(Math.abs(sim.players[0].velocity.x) < 0.1);
  sim.destroy();
});

test("patada cercana y cooldown; una orden repetida no patea dos veces", () => {
  const sim = new Simulation();
  const input = { ...emptyInput(), kick: 1 };
  Matter.Body.setPosition(sim.ball, { x: 235, y: 540 });
  sim.step(input, emptyInput());
  assert.ok(sim.ball.velocity.x > 6 && sim.ball.velocity.y < -7);
  const kickTick = sim.kicks[0];
  for (let i = 0; i < RULES.kickCooldownTicks + 2; i++) sim.step(input, emptyInput());
  assert.equal(sim.kicks[0], kickTick);
  sim.destroy();
});

test("una patada lejana no cambia la velocidad de la pelota", () => {
  const sim = new Simulation(), baseline = new Simulation();
  sim.step({ ...emptyInput(), kick: 1 }, emptyInput());
  baseline.step(emptyInput(), emptyInput());
  assert.deepEqual(sim.snapshot().ball, baseline.snapshot().ball);
  sim.destroy(); baseline.destroy();
});

test("gol único, pausa y saque: el invitado recupera exactamente el marcador", () => {
  const sim = new Simulation(), guest = new Simulation();
  Matter.Body.setPosition(sim.ball, { x: 40, y: 530 });
  sim.step(emptyInput(), emptyInput());
  assert.deepEqual(sim.score, [0, 1]);
  for (let i = 0; i < RULES.goalPauseTicks; i++) sim.step(emptyInput(), emptyInput());
  assert.deepEqual(sim.score, [0, 1]);
  assert.equal(sim.ball.position.x, 512);
  guest.restore(sim.snapshot());
  assert.deepEqual(guest.snapshot(), sim.snapshot());
  sim.destroy(); guest.destroy();
});

test("restaurar un estado y repetir controles conserva la trayectoria sin colisiones", () => {
  const host = new Simulation(), guest = new Simulation();
  const input = { ...emptyInput(), direction: -1 as const };
  for (let i = 0; i < 6; i++) host.step(emptyInput(), input);
  guest.restore(host.snapshot());
  for (let i = 0; i < 6; i++) { host.step(emptyInput(), input); guest.step(emptyInput(), input); }
  assert.ok(Math.abs(host.players[1].position.x - guest.players[1].position.x) < 0.001);
  assert.ok(Math.abs(host.ball.position.y - guest.ball.position.y) < 0.001);
  host.destroy(); guest.destroy();
});

test("no acepta entradas malformadas que puedan corromper la física", () => {
  assert.equal(isInput({ ...emptyInput(), direction: 20 }), false);
  assert.equal(isInput({ ...emptyInput(), seq: NaN }), false);
  assert.equal(isInput(emptyInput()), true);
});

test("jugadores y pelota siguen chocando con el piso después de varios goles", () => {
  const sim = new Simulation();
  try {
    const input = emptyInput();
    for (let i = 0; i < 60; i++) sim.step(input, input);
    for (let goal = 0; goal < 4; goal++) {
      Matter.Body.setPosition(sim.ball, { x: goal % 2 ? 984 : 40, y: 530 });
      Matter.Body.setVelocity(sim.ball, { x: 0, y: 0 });
      sim.step(input, input);
      assert.equal(sim.round, goal + 1);
      for (let i = 0; i < RULES.goalPauseTicks; i++) sim.step(input, input);
      assert.equal(sim.pause, 0);
      // Caída vertical lejos de los arcos para comprobar el piso sin otro gol.
      Matter.Body.setVelocity(sim.ball, { x: 0, y: 0 });
      for (let i = 0; i < 180; i++) {
        sim.step(input, input);
        for (const body of [...sim.players, sim.ball]) {
          assert.ok(body.position.y < 600, `cuerpo atravesó el piso después del gol ${goal + 1}`);
        }
      }
      assert.equal(sim.round, goal + 1);
    }
    assert.deepEqual(sim.score, [2, 2]);
  } finally { sim.destroy(); }
});

test("el invitado conserva colisiones al restaurar estados después de haber simulado", () => {
  const host = new Simulation(), guest = new Simulation();
  try {
    const input = emptyInput();
    for (let i = 0; i < 60; i++) { host.step(input, input); guest.step(input, input); }
    Matter.Body.setPosition(host.ball, { x: 512, y: 575 });
    Matter.Body.setVelocity(host.ball, { x: 0, y: 4 });
    for (let i = 0; i < 90; i++) {
      guest.restore(host.snapshot());
      host.step(input, input); guest.step(input, input);
      for (const body of [...guest.players, guest.ball]) assert.ok(body.position.y < 600);
      assert.ok(Math.abs(host.ball.position.y - guest.ball.position.y) < 0.5);
      assert.ok(Math.abs(host.players[0].position.y - guest.players[0].position.y) < 0.5);
    }
  } finally { host.destroy(); guest.destroy(); }
});
