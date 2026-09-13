import { test } from "node:test";
import assert from "node:assert/strict";
import Matter from "../client/node_modules/matter-js/build/matter.js";
import { Simulation, emptyInput, RULES, isInput } from "../client/src/game/simulation";

test("el minuto incluye las pausas de gol y congela el resultado al terminar", () => {
  const sim = new Simulation();
  try {
    const input = emptyInput();
    sim.pause = RULES.matchTicks - 1;
    sim.score = [2, 1];
    for (let i = 0; i < RULES.matchTicks - 1; i++) sim.step(input, input);
    assert.equal(sim.finished, false);
    assert.equal(sim.remainingTicks, 1);
    sim.step(input, input);
    assert.equal(sim.finished, true);
    assert.equal(sim.winner, 1);
    const final = sim.snapshot();
    for (let i = 0; i < 120; i++) sim.step({ ...input, direction: 1, kick: 1 }, input);
    assert.deepEqual(sim.snapshot(), final);
  } finally { sim.destroy(); }
});

test("resultado empatado o victoria derecha y último gol dentro del tiempo", () => {
  const sim = new Simulation();
  try {
    sim.remainingTicks = 1;
    sim.score = [0, 0];
    Matter.Body.setPosition(sim.ball, { x: 40, y: 530 });
    sim.step(emptyInput(), emptyInput());
    assert.equal(sim.winner, 2);
    assert.deepEqual(sim.score, [0, 1]);
    sim.score = [1, 1];
    assert.equal(sim.winner, null);
  } finally { sim.destroy(); }
});

test("revancha requiere ambos jugadores, ignora duplicados y sincroniza varios partidos", () => {
  const host = new Simulation(), guest = new Simulation();
  try {
    assert.equal(host.requestRematch(1, 0), false);
    for (let match = 0; match < 3; match++) {
      host.remainingTicks = 1; host.pause = 2; host.score = [3, 2];
      host.step(emptyInput(), emptyInput());
      const endTick = host.tick;
      const first = match % 2 ? 2 : 1;
      assert.equal(host.requestRematch(first, match), true);
      assert.equal(host.finished, true);
      assert.equal(host.requestRematch(first, match), false);
      guest.restore(host.snapshot());
      assert.deepEqual(guest.snapshot(), host.snapshot());
      assert.equal(host.requestRematch(first === 1 ? 2 : 1, match), true);
      assert.equal(host.requestRematch(1, match), false);
      assert.equal(host.match, match + 1);
      assert.equal(host.remainingTicks, RULES.matchTicks);
      assert.equal(host.pause, 0);
      assert.deepEqual(host.score, [0, 0]);
      assert.deepEqual(host.ready, [false, false]);
      assert.equal(host.ball.position.x, 512);
      assert.ok(host.tick > endTick);
      guest.restore(host.snapshot());
      assert.deepEqual(guest.snapshot(), host.snapshot());
    }
  } finally { host.destroy(); guest.destroy(); }
});

test("mover y saltar responde en el primer paso, sin una respuesta de red", () => {
  const sim = new Simulation();
  const one = emptyInput(), two = emptyInput();
  for (let i = 0; i < 30; i++) sim.step(one, two);
  const before = sim.players[0].position.x;
  one.direction = 1; one.jump++;
  sim.step(one, two);
  assert.ok(sim.players[0].position.x > before + 0.5);
  assert.ok(sim.players[0].velocity.y < -4);
  const moving = sim.players[0].velocity.x;
  one.direction = 0;
  sim.step(one, two);
  assert.ok(sim.players[0].velocity.x > 0 && sim.players[0].velocity.x < moving);
  sim.destroy();
});

test("patada cercana y cooldown; una orden repetida no patea dos veces", () => {
  const sim = new Simulation();
  const input = { ...emptyInput(), kick: 1 };
  for (let i = 0; i < 30; i++) sim.step(emptyInput(), emptyInput());
  Matter.Body.setPosition(sim.ball, { x: 245, y: 575 });
  Matter.Body.setVelocity(sim.ball, { x: 0, y: 0 });
  sim.step(input, emptyInput());
  assert.equal(sim.kickHits[0], -100, "el pie todavía no alcanzó la pelota");
  for (let i = 0; i < 5; i++) sim.step(input, emptyInput());
  assert.ok(sim.ball.velocity.x > 5 && sim.ball.velocity.y < -2.5);
  assert.equal(sim.kickHits[0], sim.kicks[0]);
  const kickTick = sim.kicks[0];
  for (let i = 0; i < RULES.kickCooldownTicks + 2; i++) sim.step(input, emptyInput());
  assert.equal(sim.kicks[0], kickTick);
  sim.destroy();
});

test("salto y carrera entran en los márgenes medidos del gameplay", () => {
  const sim = new Simulation();
  try {
    const idle = emptyInput();
    for (let i = 0; i < 30; i++) sim.step(idle, idle);
    const start = { ...sim.players[0].position };
    const input = { ...idle, direction: 1 as const, jump: 1 };
    let apex = start.y, flightTicks = 0;
    for (let i = 0; i < 75; i++) {
      sim.step(input, idle);
      apex = Math.min(apex, sim.players[0].position.y);
      if (i > 5 && sim.players[0].position.y >= start.y - 0.5) { flightTicks = i + 1; break; }
    }
    assert.ok(start.y - apex >= 58 && start.y - apex <= 66, `altura ${start.y - apex}`);
    assert.ok(flightTicks >= 57 && flightTicks <= 63, `duración ${flightTicks / 60}s`);
    assert.ok(sim.players[0].velocity.x >= 3.6 && sim.players[0].velocity.x <= 3.9);
    const releaseX = sim.players[0].position.x;
    for (let i = 0; i < 30; i++) sim.step(idle, idle);
    const drift = sim.players[0].position.x - releaseX;
    assert.ok(drift >= 14 && drift <= 22, `inercia al soltar ${drift}px`);
    assert.ok(Math.abs(sim.players[0].velocity.x) < 0.04);
  } finally { sim.destroy(); }
});

test("la pelota cae más despacio que la cabeza y conserva velocidad horizontal en vuelo", () => {
  const sim = new Simulation();
  try {
    Matter.Body.setPosition(sim.players[0], { x: 200, y: 200 });
    Matter.Body.setVelocity(sim.players[0], { x: 0, y: 0 });
    Matter.Body.setPosition(sim.ball, { x: 512, y: 200 });
    Matter.Body.setVelocity(sim.ball, { x: 3, y: 0 });
    for (let i = 0; i < 30; i++) sim.step(emptyInput(), emptyInput());
    assert.ok(sim.ball.position.y > 244 && sim.ball.position.y < 248);
    assert.ok(sim.players[0].position.y > 264 && sim.players[0].position.y < 268);
    assert.ok(Math.abs(sim.ball.position.x - 602) < 0.1);
  } finally { sim.destroy(); }
});

test("los rebotes libres pierden altura y la pelota no atraviesa el travesaño", () => {
  const sim = new Simulation();
  try {
    Matter.Body.setPosition(sim.ball, { x: 512, y: 400 });
    Matter.Body.setVelocity(sim.ball, { x: 0, y: 0 });
    const peaks: number[] = [];
    let oldVy = 0;
    for (let i = 0; i < 300 && peaks.length < 2; i++) {
      sim.step(emptyInput(), emptyInput());
      if (oldVy < 0 && sim.ball.velocity.y >= 0) peaks.push(578 - sim.ball.position.y);
      oldVy = sim.ball.velocity.y;
    }
    assert.equal(peaks.length, 2);
    assert.ok(peaks[0] > 35 && peaks[0] < 100);
    assert.ok(peaks[1] > 1 && peaks[1] < peaks[0] * 0.7);
    Matter.Body.setPosition(sim.ball, { x: 40, y: 430 });
    Matter.Body.setVelocity(sim.ball, { x: 0, y: 14 });
    for (let i = 0; i < 5; i++) sim.step(emptyInput(), emptyInput());
    assert.equal(sim.round, 0);
    assert.ok(sim.ball.position.y < 465 && sim.ball.velocity.y < 0);
  } finally { sim.destroy(); }
});

test("la patada no toca una pelota detrás ni por encima de la cabeza", () => {
  for (const [x, y] of [[145, 550], [210, 500]]) {
    const sim = new Simulation(), baseline = new Simulation();
    try {
      for (const s of [sim, baseline]) {
        Matter.Body.setPosition(s.ball, { x, y });
        Matter.Body.setVelocity(s.ball, { x: 0, y: 0 });
      }
      for (let i = 0; i < 12; i++) {
        sim.step({ ...emptyInput(), kick: 1 }, emptyInput());
        baseline.step(emptyInput(), emptyInput());
      }
      assert.equal(sim.kickHits[0], -100);
      assert.deepEqual(sim.snapshot().ball, baseline.snapshot().ball);
    } finally { sim.destroy(); baseline.destroy(); }
  }
});

test("mantener salto repite al aterrizar y pulsarlo en el aire no da doble salto", () => {
  const sim = new Simulation();
  try {
    const idle = emptyInput();
    for (let i = 0; i < 30; i++) sim.step(idle, idle);
    const input = { ...idle, jump: 1, jumpHeld: true };
    sim.step(input, idle);
    for (let i = 0; i < 10; i++) sim.step(input, idle);
    const vy = sim.players[0].velocity.y;
    sim.step({ ...input, jump: 2 }, idle);
    assert.ok(sim.players[0].velocity.y > vy, "no reinicia el salto en el aire");
    let repeated = false;
    for (let i = 0; i < 65; i++) {
      const previousVy = sim.players[0].velocity.y;
      sim.step({ ...input, jump: 2 }, idle);
      if (previousVy >= 0 && sim.players[0].velocity.y < -4) repeated = true;
    }
    assert.ok(repeated);
  } finally { sim.destroy(); }
});

test("se puede saltar apoyado en el travesaño o en el rival", () => {
  for (const support of ["bar", "player"]) {
    const sim = new Simulation();
    try {
      Matter.Body.setPosition(sim.ball, { x: 700, y: 200 });
      Matter.Body.setVelocity(sim.ball, { x: 0, y: 0 });
      Matter.Body.setPosition(sim.players[0], support === "bar" ? { x: 40, y: 438 } : { x: 824, y: 515 });
      for (let i = 0; i < 30; i++) sim.step(emptyInput(), emptyInput());
      sim.step({ ...emptyInput(), jump: 1 }, emptyInput());
      assert.ok(sim.players[0].velocity.y < -4, support);
    } finally { sim.destroy(); }
  }
});

test("restaurar durante la patada conserva el contacto pendiente y no duplica un golpe", () => {
  const host = new Simulation(), guest = new Simulation();
  try {
    const idle = emptyInput(), kick = { ...idle, kick: 1 };
    for (let i = 0; i < 30; i++) host.step(idle, idle);
    Matter.Body.setPosition(host.ball, { x: 245, y: 575 });
    Matter.Body.setVelocity(host.ball, { x: 0, y: 0 });
    host.step(kick, idle);
    for (let i = 0; i < 12; i++) {
      guest.restore(host.snapshot());
      host.step(kick, idle); guest.step(kick, idle);
      assert.deepEqual(guest.kickHits, host.kickHits);
      assert.ok(Math.hypot(host.ball.position.x - guest.ball.position.x, host.ball.position.y - guest.ball.position.y) < 0.5);
    }
    assert.equal(host.kickHits[0], host.kicks[0]);
  } finally { host.destroy(); guest.destroy(); }
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
