import { test } from "node:test";
import assert from "node:assert/strict";
import Matter from "../client/node_modules/matter-js/build/matter.js";
import { Simulation, bootPose, circleBox, emptyInput, RULES, isInput } from "../client/src/game/simulation";
import { ARENA_SLOPES, PITCH_FLOOR_Y, VISUAL_SCALE } from "../client/src/game/visual-proportions";

test("la pelota tiene una salida contenida y pierde velocidad entre contactos", () => {
  const sim = new Simulation();
  try {
    Matter.Body.setPosition(sim.ball, { x: 512, y: 80 });
    Matter.Body.setVelocity(sim.ball, { x: 20, y: 0 });
    sim.step(emptyInput(), emptyInput());
    assert.ok(Math.hypot(sim.ball.velocity.x, sim.ball.velocity.y) <= 10.5, "el límite evita tiros incontrolables");

    Matter.Body.setPosition(sim.ball, { x: 512, y: 300 });
    Matter.Body.setVelocity(sim.ball, { x: 0, y: 0 });
    const launchSpeed = 10;
    Matter.Body.setVelocity(sim.ball, { x: launchSpeed, y: 0 });
    for (let i = 0; i < 60; i++) sim.step(emptyInput(), emptyInput());
    assert.ok(sim.ball.velocity.x < launchSpeed * 0.9, "la pelota debe amortiguarse en vuelo");

    Matter.Body.setPosition(sim.ball, { x: 512, y: 300 });
    Matter.Body.setVelocity(sim.ball, { x: 0, y: 0 });
    let rebound = 0;
    for (let i = 0; i < 120; i++) {
      const before = sim.ball.velocity.y;
      sim.step(emptyInput(), emptyInput());
      if (before > 0 && sim.ball.velocity.y < 0) { rebound = -sim.ball.velocity.y / before; break; }
    }
    assert.ok(rebound > 0.45 && rebound < 0.51, `restitución ${rebound}`);
  } finally { sim.destroy(); }
});

test("la pelota conserva mejor la velocidad horizontal y tiene un rebote más vivo", () => {
  const sim = new Simulation();
  try {
    Matter.Body.setPosition(sim.ball, { x: 512, y: 300 });
    Matter.Body.setVelocity(sim.ball, { x: 3, y: 0 });
    for (let i = 0; i < 60; i++) sim.step(emptyInput(), emptyInput());
    assert.ok(
      sim.ball.velocity.x > 2.64 && sim.ball.velocity.x < 2.73,
      `velocidad horizontal ${sim.ball.velocity.x}`,
    );

    Matter.Body.setPosition(sim.ball, { x: 512, y: 300 });
    Matter.Body.setVelocity(sim.ball, { x: 0, y: 0 });
    let rebound = 0;
    for (let i = 0; i < 120; i++) {
      const before = sim.ball.velocity.y;
      sim.step(emptyInput(), emptyInput());
      if (before > 0 && sim.ball.velocity.y < 0) {
        rebound = -sim.ball.velocity.y / before;
        break;
      }
    }
    assert.ok(rebound > 0.45 && rebound < 0.51, `restitución ${rebound}`);
  } finally {
    sim.destroy();
  }
});

test("círculo contra caja resuelve caras, esquinas y centros interiores", () => {
  assert.equal(circleBox(30, 0, 12, 8, 9), null);
  assert.deepEqual(circleBox(0, 0, 12, 8, 9), { nx: 1, ny: 0, depth: 20 });
  assert.deepEqual(circleBox(0, -15, 12, 8, 9), { nx: 0, ny: -1, depth: 6 });
  const corner = circleBox(14, 15, 12, 8, 9)!;
  assert.ok(Math.abs(corner.nx - Math.SQRT1_2) < 1e-12);
  assert.ok(Math.abs(corner.depth - (12 - Math.sqrt(72))) < 1e-12);
});

test("un impacto en la cabeza usa restitución contenida sin desplazar al jugador", () => {
  const sim = new Simulation(), baseline = new Simulation();
  try {
    for (const s of [sim, baseline]) {
      Matter.Body.setPosition(s.players[0], { x: 400, y: 300 });
      Matter.Body.setVelocity(s.players[0], { x: 0, y: 0 });
    }
    Matter.Body.setPosition(sim.ball, { x: 365, y: 300 });
    Matter.Body.setVelocity(sim.ball, { x: 6, y: 0 });
    sim.step(emptyInput(), emptyInput()); baseline.step(emptyInput(), emptyInput());
    assert.deepEqual(sim.snapshot().players, baseline.snapshot().players);
    assert.ok(Math.abs(sim.ball.velocity.x + 2.4) < 0.03);
  } finally { sim.destroy(); baseline.destroy(); }
});

test("centros coincidentes se separan sin NaN y no impulsan si ya se alejan", () => {
  for (const offset of [0, -30]) {
    const sim = new Simulation();
    try {
      Matter.Body.setPosition(sim.players[0], { x: 400, y: 300 });
      Matter.Body.setPosition(sim.ball, { x: 400 + offset, y: 300 });
      Matter.Body.setVelocity(sim.ball, { x: offset ? -2 : 0, y: 0 });
      sim.step(emptyInput(), emptyInput());
      assert.ok(Object.values(sim.snapshot().ball).every(Number.isFinite));
      assert.ok(Math.hypot(sim.ball.position.x - sim.players[0].position.x, sim.ball.position.y - sim.players[0].position.y) >= 33.99);
      if (offset) assert.ok(Math.abs(sim.ball.velocity.x + 2) < 0.05);
    } finally { sim.destroy(); }
  }
});

test("la pelota rápida no atraviesa cabeza, bota ni travesaño", () => {
  for (const target of ["head", "boot", "bar"]) {
    const sim = new Simulation();
    try {
      const idle = emptyInput(), held = { ...idle, kick: 1, kickHeld: true };
      for (let i = 0; i < 30; i++) sim.step(held, idle);
      const player = sim.players[0];
      Matter.Body.setPosition(sim.ball, target === "bar" ? { x: RULES.goalWidth / 2, y: RULES.goalTop - 28 * VISUAL_SCALE }
        : { x: player.position.x + (target === "boot" ? 49 : -40), y: player.position.y });
      Matter.Body.setVelocity(sim.ball, target === "bar" ? { x: 0, y: 14 }
        : { x: target === "boot" ? -14 : 14, y: 0 });
      for (let i = 0; i < 3; i++) sim.step(held, idle);
      if (target === "bar") assert.ok(sim.ball.position.y < RULES.goalTop && sim.ball.velocity.y < 0);
      else assert.ok(target === "boot" ? sim.ball.velocity.x > 0 : sim.ball.velocity.x < 0);
    } finally { sim.destroy(); }
  }
});

test("mantener la tecla no inicia patadas nuevas y el pie sigue bloqueando la pelota", () => {
  const sim = new Simulation();
  try {
    const hold = { ...emptyInput(), kick: 1, kickHeld: true };
    sim.step(hold, emptyInput());
    const firstPress = sim.kicks[0];
    for (let i = 0; i < 90; i++) sim.step(hold, emptyInput());
    assert.equal(sim.kicks[0], firstPress, "el pie debe quedar arriba, sin repetir el gesto");
    Matter.Body.setPosition(sim.ball, { x: sim.players[0].position.x + 60, y: sim.players[0].position.y });
    Matter.Body.setVelocity(sim.ball, { x: -3, y: 0 });
    for (let i = 0; i < 6; i++) sim.step(hold, emptyInput());
    assert.ok(sim.ball.velocity.x > 0, "la pelota debe rebotar en el pie levantado antes de llegar a la cabeza");
  } finally { sim.destroy(); }
});

test("el rival no puede atravesar el pie que se mantiene levantado", () => {
  const sim = new Simulation();
  try {
    const hold = { ...emptyInput(), kick: 1, kickHeld: true };
    for (let i = 0; i < 40; i++) sim.step(hold, emptyInput());
    Matter.Body.setPosition(sim.players[1], { x: 278, y: sim.players[0].position.y });
    for (let i = 0; i < 30; i++) sim.step(hold, { ...emptyInput(), direction: -1 });
    assert.ok(sim.players[1].position.x - sim.players[0].position.x > 50, "la bota compacta ocupa espacio delante de la cabeza");
  } finally { sim.destroy(); }
});

test("la pelota rueda varios segundos y pierde velocidad gradualmente", () => {
  const sim = new Simulation();
  try {
    Matter.Body.setPosition(sim.ball, { x: 512, y: 578 });
    Matter.Body.setVelocity(sim.ball, { x: 0.3, y: 0 });
    for (let i = 0; i < 300; i++) sim.step(emptyInput(), emptyInput());
    assert.ok(sim.ball.position.x > 570 && sim.ball.position.x < 590, `posición ${sim.ball.position.x}`);
    assert.ok(sim.ball.velocity.x > 0.14 && sim.ball.velocity.x < 0.18);
  } finally { sim.destroy(); }
});

test("dos pies levantados también se bloquean entre sí", () => {
  const sim = new Simulation();
  try {
    const hold = { ...emptyInput(), kick: 1, kickHeld: true };
    for (let i = 0; i < 150; i++) sim.step({ ...hold, direction: 1 }, { ...hold, direction: -1 });
    assert.ok(sim.players[1].position.x - sim.players[0].position.x >= 61.99);
    assert.ok(Math.hypot(sim.boots[1].position.x - sim.boots[0].position.x, sim.boots[1].position.y - sim.boots[0].position.y) >= 15.99);
    assert.ok(sim.players.every(player => Math.abs(player.velocity.y) < 0.2));
  } finally { sim.destroy(); }
});

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

test("una pulsación breve barre la pelota y una orden repetida no reinicia el gesto", () => {
  const sim = new Simulation();
  const input = { ...emptyInput(), kick: 1 };
  for (let i = 0; i < 30; i++) sim.step(emptyInput(), emptyInput());
  Matter.Body.setPosition(sim.ball, { x: 238, y: 575 });
  Matter.Body.setVelocity(sim.ball, { x: 0, y: 0 });
  sim.step(input, emptyInput());
  for (let i = 0; i < 5; i++) sim.step(input, emptyInput());
  assert.ok(sim.ball.velocity.x > 5 && sim.ball.velocity.y < -2.5);
  const kickTick = sim.kicks[0];
  for (let i = 0; i < 24; i++) sim.step(input, emptyInput());
  assert.equal(sim.kicks[0], kickTick);
  assert.equal(sim.feet[0].lift, 0);
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
    assert.ok(sim.ball.position.y > 242 && sim.ball.position.y < 246);
    assert.ok(sim.players[0].position.y > 264 && sim.players[0].position.y < 268);
    assert.ok(Math.abs(sim.ball.position.x - 599.3) < 0.5);
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
      if (oldVy < 0 && sim.ball.velocity.y >= 0) peaks.push(PITCH_FLOOR_Y - RULES.ballRadius - sim.ball.position.y);
      oldVy = sim.ball.velocity.y;
    }
    assert.equal(peaks.length, 2);
    assert.ok(peaks[0] > 30 && peaks[0] < 45);
    assert.ok(peaks[1] > 0.5 && peaks[1] < peaks[0] * 0.7);
    Matter.Body.setPosition(sim.ball, { x: RULES.goalWidth / 2, y: RULES.goalTop - 28 * VISUAL_SCALE });
    Matter.Body.setVelocity(sim.ball, { x: 0, y: 14 });
    for (let i = 0; i < 5; i++) sim.step(emptyInput(), emptyInput());
    assert.equal(sim.round, 0);
    assert.ok(sim.ball.position.y < RULES.goalTop && sim.ball.velocity.y < 0);
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
      Matter.Body.setPosition(sim.players[0], support === "bar"
        ? { x: RULES.goalWidth / 2, y: RULES.goalTop - RULES.playerRadius - 2.5 * VISUAL_SCALE }
        : { x: 824, y: 515 });
      for (let i = 0; i < 30; i++) sim.step(emptyInput(), emptyInput());
      sim.step({ ...emptyInput(), jump: 1 }, emptyInput());
      assert.ok(sim.players[0].velocity.y < -4, support);
    } finally { sim.destroy(); }
  }
});

test("restaurar durante el barrido conserva la posición del pie y la trayectoria del contacto", () => {
  const host = new Simulation(), guest = new Simulation();
  try {
    const idle = emptyInput(), kick = { ...idle, kick: 1 };
    for (let i = 0; i < 30; i++) host.step(idle, idle);
    Matter.Body.setPosition(host.ball, { x: 238, y: 575 });
    Matter.Body.setVelocity(host.ball, { x: 0, y: 0 });
    host.step(kick, idle);
    for (let i = 0; i < 12; i++) {
      guest.restore(host.snapshot());
      host.step(kick, idle); guest.step(kick, idle);
      assert.deepEqual(guest.feet, host.feet);
      assert.ok(Math.hypot(host.ball.position.x - guest.ball.position.x, host.ball.position.y - guest.ball.position.y) < 0.5);
    }
    assert.ok(host.ball.velocity.x > 4);
  } finally { host.destroy(); guest.destroy(); }
});

test("el pie describe una órbita, queda arriba y vuelve al reposo al soltar", () => {
  assert.equal(RULES.bootOrbit, 27 * VISUAL_SCALE);
  for (const team of [1, 2] as const) {
    const sim = new Simulation();
    try {
      const idle = emptyInput(), hold = { ...idle, kick: 1, kickHeld: true }, index = team - 1;
      const side = team === 1 ? 1 : -1;
      const rest = bootPose(team, 0), raised = bootPose(team, 1);
      assert.ok(rest.x * side < 0, "el pie empieza detrás y debajo del cuerpo");
      assert.ok(rest.y > 29 && rest.y < 31);
      assert.ok(raised.x * side > 34 && raised.x * side < 35, "el pie termina delante del cuerpo");
      assert.ok(Math.abs(raised.y) < 0.001, "el pie termina a la altura del centro del cuerpo");
      for (let i = 0; i < 3; i++) sim.step(team === 1 ? hold : idle, team === 2 ? hold : idle);
      assert.ok(sim.feet[index].lift < 0.5, "el barrido no debe completarse en los tres ticks actuales");
      for (let i = 0; i < 80; i++) {
        sim.step(team === 1 ? hold : idle, team === 2 ? hold : idle);
        const pose = bootPose(team, sim.feet[index].lift);
        assert.ok(Math.abs(Math.hypot(pose.x, pose.y) - RULES.bootOrbit) < 0.001);
        if (i > 10) assert.equal(sim.feet[index].lift, 1);
        assert.ok(Math.abs(sim.boots[index].position.x - sim.players[index].position.x - pose.x) < 0.001);
      }
      sim.step(idle, idle);
      assert.ok(sim.feet[index].lift < 1 && sim.feet[index].lift > 0);
      for (let i = 0; i < 12; i++) sim.step(idle, idle);
      assert.equal(sim.feet[index].lift, 0);
      // Un toque liberado a mitad del ascenso no completa una animación fija.
      sim.step(team === 1 ? { ...hold, kick: 2 } : idle, team === 2 ? { ...hold, kick: 2 } : idle);
      const partial = sim.feet[index].lift;
      sim.step(idle, idle);
      assert.ok(sim.feet[index].lift < partial);
    } finally { sim.destroy(); }
  }
});

test("la pelota rápida se limita después de medio segundo de rodar", () => {
  const sim = new Simulation();
  try {
    Matter.Body.setPosition(sim.ball, { x: 512, y: PITCH_FLOOR_Y - RULES.ballRadius });
    Matter.Body.setVelocity(sim.ball, { x: 6, y: 0 });
    for (let i = 0; i < 29; i++) sim.step(emptyInput(), emptyInput());
    assert.ok(sim.ball.velocity.x > RULES.maxRollSpeed, "no debe frenarse antes de 500 ms");
    sim.step(emptyInput(), emptyInput());
    assert.equal(sim.ball.velocity.x, RULES.maxRollSpeed);
    assert.equal(sim.ballRollMs, RULES.rollLimitDelayMs);
  } finally { sim.destroy(); }
});

test("el límite de rodamiento no aumenta una pelota lenta", () => {
  const sim = new Simulation();
  try {
    Matter.Body.setPosition(sim.ball, { x: 512, y: PITCH_FLOOR_Y - RULES.ballRadius });
    Matter.Body.setVelocity(sim.ball, { x: 2, y: 0 });
    for (let i = 0; i < 60; i++) sim.step(emptyInput(), emptyInput());
    assert.ok(sim.ball.velocity.x > 0 && sim.ball.velocity.x < 2);
    assert.equal(sim.ballRollMs, RULES.rollLimitDelayMs);
  } finally { sim.destroy(); }
});

test("despegar o picar reinicia el tiempo continuo de rodamiento", () => {
  const sim = new Simulation();
  try {
    Matter.Body.setPosition(sim.ball, { x: 512, y: PITCH_FLOOR_Y - RULES.ballRadius });
    Matter.Body.setVelocity(sim.ball, { x: -6, y: 0 });
    for (let i = 0; i < 29; i++) sim.step(emptyInput(), emptyInput());
    assert.ok(sim.ballRollMs < RULES.rollLimitDelayMs);

    Matter.Body.setPosition(sim.ball, { x: 512, y: PITCH_FLOOR_Y - RULES.ballRadius - 20 });
    Matter.Body.setVelocity(sim.ball, { x: -6, y: -1 });
    sim.step(emptyInput(), emptyInput());
    assert.equal(sim.ballRollMs, 0);

    Matter.Body.setPosition(sim.ball, { x: 512, y: PITCH_FLOOR_Y - RULES.ballRadius });
    Matter.Body.setVelocity(sim.ball, { x: -6, y: 0 });
    for (let i = 0; i < 10; i++) sim.step(emptyInput(), emptyInput());
    assert.ok(sim.ballRollMs > 0);
    Matter.Body.setPosition(sim.ball, { x: 512, y: PITCH_FLOOR_Y - RULES.ballRadius });
    Matter.Body.setVelocity(sim.ball, { x: -6, y: 1 });
    sim.step(emptyInput(), emptyInput());
    assert.ok(sim.ball.velocity.y < -RULES.rollVerticalTolerance);
    assert.equal(sim.ballRollMs, 0);

    Matter.Body.setPosition(sim.ball, { x: 512, y: PITCH_FLOOR_Y - RULES.ballRadius });
    Matter.Body.setVelocity(sim.ball, { x: -6, y: 0 });
    for (let i = 0; i < 29; i++) sim.step(emptyInput(), emptyInput());
    assert.ok(Math.abs(sim.ball.velocity.x) > RULES.maxRollSpeed, "debe esperar otros 500 ms completos");
    sim.step(emptyInput(), emptyInput());
    assert.equal(sim.ball.velocity.x, -RULES.maxRollSpeed);
  } finally { sim.destroy(); }
});

test("al soltar la patada, el botín no arrastra la pelota detrás del jugador", () => {
  for (const team of [1, 2] as const) {
    const sim = new Simulation();
    try {
      const idle = emptyInput(), hold = { ...idle, kick: 1, kickHeld: true };
      const inputs = team === 1 ? [hold, idle] as const : [idle, hold] as const;
      for (let i = 0; i < 30; i++) sim.step(...inputs);

      const index = team - 1, side = team === 1 ? 1 : -1;
      const player = sim.players[index], raised = bootPose(team, 1);
      Matter.Body.setPosition(sim.ball, {
        // El rival la deja apenas detrás del centro del botín levantado.
        x: player.position.x + raised.x - side * 12,
        y: PITCH_FLOOR_Y - RULES.ballRadius,
      });
      Matter.Body.setVelocity(sim.ball, { x: 0, y: 0 });

      const release = { ...hold, kickHeld: false };
      for (let i = 0; i < RULES.bootLowerTicks + 4; i++) {
        sim.step(...(team === 1 ? [release, idle] as const : [idle, release] as const));
      }

      assert.ok(
        (sim.ball.position.x - player.position.x) * side >= RULES.playerRadius,
        `la pelota terminó detrás del frente del jugador ${team}: x=${sim.ball.position.x}`,
      );
    } finally {
      sim.destroy();
    }
  }
});

test("la pelota rebota contra las pendientes superiores del estadio", () => {
  for (const [start, end] of ARENA_SLOPES) {
    const sim = new Simulation();
    try {
      const sx = end.x - start.x, sy = end.y - start.y;
      const length = Math.hypot(sx, sy);
      const normal = { x: sy / length, y: -sx / length };
      Matter.Body.setPosition(sim.ball, {
        x: (start.x + end.x) / 2 + normal.x * (RULES.ballRadius + 1),
        y: (start.y + end.y) / 2 + normal.y * (RULES.ballRadius + 1),
      });
      Matter.Body.setVelocity(sim.ball, { x: -normal.x * 6, y: -normal.y * 6 });
      sim.step(emptyInput(), emptyInput());
      const outgoing = sim.ball.velocity.x * normal.x + sim.ball.velocity.y * normal.y;
      assert.ok(outgoing > 2.5, `la pendiente debe devolver la pelota hacia la cancha: ${outgoing}`);
    } finally {
      sim.destroy();
    }
  }
});

test("el pie atraviesa el suelo y el cuerpo sigue siendo el único apoyo", () => {
  const sim = new Simulation();
  try {
    const idle = emptyInput();
    for (let i = 0; i < 60; i++) sim.step(idle, idle);
    const player = sim.players[0], boot = sim.boots[0];
    assert.equal(boot.collisionFilter.mask & 1, 0, "el pie no colisiona con el mundo");
    assert.ok(player.position.y + RULES.playerRadius <= PITCH_FLOOR_Y + 0.1, "el cuerpo apoya sobre el piso");
    assert.ok(boot.position.y + RULES.bootHeight / 2 > PITCH_FLOOR_Y, "el pie puede atravesar visualmente el piso");
  } finally { sim.destroy(); }
});

test("la patada activa tiene salida fija y simétrica en ambos lados", () => {
  const results: number[] = [];
  assert.equal(RULES.kickX, 6);
  assert.equal(RULES.kickY, 5.6);
  for (const team of [1, 2] as const) {
    for (const ballY of [575, 563]) {
      const sim = new Simulation();
      try {
        for (let i = 0; i < 30; i++) sim.step(emptyInput(), emptyInput());
        const player = sim.players[team - 1], side = team === 1 ? 1 : -1;
        Matter.Body.setPosition(sim.ball, { x: player.position.x + side * 38, y: ballY });
        Matter.Body.setVelocity(sim.ball, { x: 0, y: 0 });
        const hold = { ...emptyInput(), kick: 1, kickHeld: true };
        for (let i = 0; i < 10; i++) sim.step(team === 1 ? hold : emptyInput(), team === 2 ? hold : emptyInput());
        assert.ok(sim.ball.velocity.x * side > 5.5);
        const kickSpeed = Math.hypot(sim.ball.velocity.x, sim.ball.velocity.y);
        assert.ok(kickSpeed > 7.5 && kickSpeed < 8.5, `salida de patada ${kickSpeed}`);
        assert.ok(sim.ball.velocity.y < -5, `altura de patada ${sim.ball.velocity.y}`);
        results.push(sim.ball.velocity.y);
      } finally { sim.destroy(); }
    }
  }
  assert.ok(Math.abs(results[0] - results[1]) < 0.3, "la salida se mantiene entre alturas de contacto");
  assert.ok(Math.abs(results[0] - results[2]) < 0.2, "los dos lados tienen la misma física");
});

test("el rebote libre conserva aproximadamente el 48 por ciento de velocidad vertical", () => {
  const sim = new Simulation();
  try {
    Matter.Body.setPosition(sim.ball, { x: 512, y: 300 });
    Matter.Body.setVelocity(sim.ball, { x: 0, y: 0 });
    let before = 0, rebound = 0;
    for (let i = 0; i < 100; i++) {
      before = sim.ball.velocity.y;
      sim.step(emptyInput(), emptyInput());
      if (before > 0 && sim.ball.velocity.y < 0) { rebound = -sim.ball.velocity.y / before; break; }
    }
    assert.ok(rebound > 0.45 && rebound < 0.51, `restitución ${rebound}`);
  } finally { sim.destroy(); }
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
