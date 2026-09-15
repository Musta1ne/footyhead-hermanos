import assert from "node:assert/strict";
import test from "node:test";
import Matter from "../client/node_modules/matter-js/build/matter.js";
import { Simulation, bootPose, emptyInput, RULES } from "../client/src/game/simulation";
import { PITCH_FLOOR_Y } from "../client/src/game/visual-proportions";

const bodyValues = (body: Matter.Body) => [
  body.position.x, body.position.y, body.velocity.x, body.velocity.y,
  body.angle, body.angularVelocity,
];

const assertFiniteBody = (body: Matter.Body, label: string) => {
  assert.ok(bodyValues(body).every(Number.isFinite), `${label} contiene NaN/Infinity`);
};

const assertBodyClose = (actual: Matter.Body, expected: Matter.Body, label: string, tolerance = 1e-9) => {
  bodyValues(actual).forEach((value, i) => {
    assert.ok(Math.abs(value - bodyValues(expected)[i]) < tolerance, `${label}[${i}]: ${value} != ${bodyValues(expected)[i]}`);
  });
};

const angleDistance = (a: number, b: number) => {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
};

test("la patada sube gradualmente sin sacudida ni rebote angular grande", () => {
  for (const team of [1, 2] as const) {
    const sim = new Simulation();
    try {
      const index = team - 1, side = team === 1 ? -1 : 1;
      const rest = bootPose(team, 0).angle;
      const travel = Math.abs(bootPose(team, 1).angle - rest);
      const hold = { ...emptyInput(), kick: 1, kickHeld: true };
      const progress: number[] = [];
      let peakSpin = 0;
      for (let tick = 0; tick < 35; tick++) {
        sim.step(team === 1 ? hold : emptyInput(), team === 2 ? hold : emptyInput());
        const boot = sim.boots[index];
        progress.push(side * (boot.angle - rest) / travel);
        peakSpin = Math.max(peakSpin, Math.abs(boot.angularVelocity));
      }
      assert.ok(progress[7] < 0.65, `la bota ${team} sube demasiado rápido: ${progress[7]}`);
      assert.ok(peakSpin < 0.25, `la bota ${team} gira bruscamente: ${peakSpin}`);
      assert.ok(Math.max(...progress) < 1.15, `la bota ${team} rebota más allá de la patada: ${Math.max(...progress)}`);
      assert.ok(progress[34] > 0.8, `la bota ${team} no llega a la posición levantada: ${progress[34]}`);
    } finally {
      sim.destroy();
    }
  }
});

const rotate = (point: { x: number; y: number }, angle: number) => ({
  x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
  y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
});

const settleBootInAir = (sim: Simulation, index: number) => {
  const hold = { ...emptyInput(), kick: 1, kickHeld: true };
  const controls = index === 0 ? [hold, emptyInput()] as const : [emptyInput(), hold] as const;
  for (let tick = 0; tick < 90; tick++) sim.step(...controls);
  const player = sim.players[index];
  const delta = { x: 400 - player.position.x, y: 300 - player.position.y };
  Matter.Body.translate(player, delta);
  Matter.Body.translate(sim.boots[index], delta);
  Matter.Body.setVelocity(player, { x: 0, y: 0 });
  Matter.Body.setVelocity(sim.boots[index], { x: 0, y: 0 });
};

const contactFace = (sim: Simulation, index: number) => {
  const player = sim.players[index], boot = sim.boots[index];
  const radial = { x: boot.position.x - player.position.x, y: boot.position.y - player.position.y };
  const candidates = [
    { x: Math.cos(boot.angle), y: Math.sin(boot.angle), extent: RULES.bootWidth / 2 },
    { x: -Math.cos(boot.angle), y: -Math.sin(boot.angle), extent: RULES.bootWidth / 2 },
    { x: -Math.sin(boot.angle), y: Math.cos(boot.angle), extent: RULES.bootHeight / 2 },
    { x: Math.sin(boot.angle), y: -Math.cos(boot.angle), extent: RULES.bootHeight / 2 },
  ];
  return candidates.reduce((best, candidate) =>
    candidate.x * radial.x + candidate.y * radial.y > best.x * radial.x + best.y * radial.y ? candidate : best,
  candidates[0]);
};

test("las botas tienen masa finita y un pivote con el radio de la órbita", () => {
  const sim = new Simulation();
  try {
    sim.boots.forEach((boot, i) => {
      assert.equal(boot.isStatic, false);
      assert.ok(Number.isFinite(boot.mass) && boot.mass > 0);
      assert.ok(Number.isFinite(boot.inertia) && boot.inertia > 0);
      // Matter's zero-length pin is valid when its body-B offset puts the
      // anchor on the player center; check the actual world anchors instead
      // of requiring one particular constraint encoding.
      const pivotA = Matter.Constraint.pointAWorld(sim.bootPivots[i]);
      const pivotB = Matter.Constraint.pointBWorld(sim.bootPivots[i]);
      assert.ok(Math.hypot(pivotA.x - pivotB.x, pivotA.y - pivotB.y) < 0.01,
        `anclaje inicial ${i}: ${pivotA.x - pivotB.x}, ${pivotA.y - pivotB.y}`);
      const distance = Math.hypot(
        boot.position.x - sim.players[i].position.x,
        boot.position.y - sim.players[i].position.y,
      );
      assert.ok(Math.abs(distance - RULES.bootOrbit) < 0.01, `pivote ${i}: radio ${distance}`);
    });
  } finally {
    sim.destroy();
  }
});

test("un impacto en cada sentido transmite impulso frente a un baseline idéntico", () => {
  for (const index of [0, 1]) {
    const sim = new Simulation();
    const baseline = new Simulation();
    try {
      settleBootInAir(sim, index);
      settleBootInAir(baseline, index);
      const boot = sim.boots[index];
      const normal = contactFace(sim, index);
      const ballCenter = {
        x: boot.position.x + normal.x * (normal.extent + RULES.ballRadius - 2),
        y: boot.position.y + normal.y * (normal.extent + RULES.ballRadius - 2),
      };
      Matter.Body.setPosition(baseline.ball, { x: 512, y: 200 });
      Matter.Body.setVelocity(baseline.ball, { x: 0, y: 0 });
      Matter.Body.setPosition(sim.ball, ballCenter);
      Matter.Body.setVelocity(sim.ball, { x: -normal.x * 6, y: -normal.y * 6 });
      const before = baseline.boots[index].velocity.x * normal.x + baseline.boots[index].velocity.y * normal.y;
      sim.step(emptyInput(), emptyInput());
      baseline.step(emptyInput(), emptyInput());
      const after = sim.boots[index].velocity.x * normal.x + sim.boots[index].velocity.y * normal.y;
      const noContact = baseline.boots[index].velocity.x * normal.x + baseline.boots[index].velocity.y * normal.y;
      assert.ok(Math.abs(after - noContact) > 0.01, `sin impulso en equipo ${index + 1}: ${noContact} -> ${after}`);
    } finally {
      sim.destroy();
      baseline.destroy();
    }

    // The reverse direction matters too: a moving boot must not be a
    // one-way sensor that leaves the ball stationary on contact.
    const movingBoot = new Simulation();
    const noContact = new Simulation();
    try {
      settleBootInAir(movingBoot, index);
      settleBootInAir(noContact, index);
      const boot = movingBoot.boots[index];
      const normal = contactFace(movingBoot, index);
      const distance = normal.extent + RULES.ballRadius - 2;
      Matter.Body.setPosition(noContact.ball, { x: 512, y: 200 });
      Matter.Body.setVelocity(noContact.ball, { x: 0, y: 0 });
      Matter.Body.setPosition(movingBoot.ball, {
        x: boot.position.x + normal.x * distance,
        y: boot.position.y + normal.y * distance,
      });
      Matter.Body.setVelocity(movingBoot.ball, { x: 0, y: 0 });
      Matter.Body.setVelocity(boot, { x: normal.x * 4, y: normal.y * 4 });
      Matter.Body.setVelocity(noContact.boots[index], { x: normal.x * 4, y: normal.y * 4 });
      movingBoot.step(emptyInput(), emptyInput());
      noContact.step(emptyInput(), emptyInput());
      const ballOut = movingBoot.ball.velocity.x * normal.x + movingBoot.ball.velocity.y * normal.y;
      const baselineOut = noContact.ball.velocity.x * normal.x + noContact.ball.velocity.y * normal.y;
      assert.ok(Math.abs(ballOut - baselineOut) > 0.05,
        `la bota no transmite impulso al balón en equipo ${index + 1}: ${baselineOut} -> ${ballOut}`);
    } finally {
      movingBoot.destroy();
      noContact.destroy();
    }
  }
});

test("el pivote es rígido: el anclaje rota con la bota y no con bootPose", () => {
  const sim = new Simulation();
  try {
    const index = 0;
    const boot = sim.boots[index];
    const pivot = sim.bootPivots[index];
    const initialAngle = boot.angle;
    const initialPointB = { x: pivot.pointB.x, y: pivot.pointB.y };
    const hold = { ...emptyInput(), kick: 1, kickHeld: true };
    for (let tick = 0; tick < RULES.bootRaiseTicks + 2; tick++) sim.step(hold, emptyInput());
    const referenceAngle = (pivot as Matter.Constraint & { angleB: number }).angleB;
    const expected = rotate(initialPointB, referenceAngle - initialAngle);
    assert.ok(Math.hypot(pivot.pointB.x - expected.x, pivot.pointB.y - expected.y) < 0.05,
      `el anclaje fue animado: ${pivot.pointB.x},${pivot.pointB.y} != ${expected.x},${expected.y}`);
    let pivotA = Matter.Constraint.pointAWorld(pivot), pivotB = Matter.Constraint.pointBWorld(pivot);
    assert.ok(Math.hypot(pivotA.x - pivotB.x, pivotA.y - pivotB.y) < 0.1, "el anclaje se separó al levantar");

    // A contact may impart angular velocity, but it must not change the
    // rigid attachment vector's relationship to the body's rotation.
    const normal = { x: Math.sin(boot.angle), y: -Math.cos(boot.angle) };
    const distance = RULES.bootHeight / 2 + RULES.ballRadius - 1;
    Matter.Body.setPosition(sim.ball, {
      x: boot.position.x + normal.x * distance,
      y: boot.position.y + normal.y * distance,
    });
    Matter.Body.setVelocity(sim.ball, { x: -normal.x * 6, y: -normal.y * 6 });
    sim.step(emptyInput(), emptyInput());
    const afterReferenceAngle = (pivot as Matter.Constraint & { angleB: number }).angleB;
    const afterImpact = rotate(initialPointB, afterReferenceAngle - initialAngle);
    assert.ok(Math.hypot(pivot.pointB.x - afterImpact.x, pivot.pointB.y - afterImpact.y) < 0.05,
      "el impacto debe conservar el pivote rígido");
    pivotA = Matter.Constraint.pointAWorld(pivot); pivotB = Matter.Constraint.pointBWorld(pivot);
    assert.ok(Math.hypot(pivotA.x - pivotB.x, pivotA.y - pivotB.y) < 0.1, "el anclaje se separó al impactar");
  } finally {
    sim.destroy();
  }
});

test("un impulso angular controlado sobrepasa el objetivo y revierte suavemente", () => {
  const sim = new Simulation();
  try {
    const boot = sim.boots[0];
    const target = bootPose(1, 0).angle;
    Matter.Body.setAngle(boot, target + 0.4);
    Matter.Body.setAngularVelocity(boot, 0);
    const errors = [Math.atan2(Math.sin(boot.angle - target), Math.cos(boot.angle - target))];
    for (let tick = 0; tick < 60; tick++) {
      sim.step(emptyInput(), emptyInput());
      errors.push(Math.atan2(Math.sin(boot.angle - target), Math.cos(boot.angle - target)));
    }
    const firstOvershoot = errors.findIndex((error, i) => i > 0 && error < -0.01);
    assert.ok(firstOvershoot > 0, `el impulso no sobrepasó el objetivo: mínimo ${Math.min(...errors)}`);
    assert.ok(Math.max(...errors) > 0.2, "el impulso angular inicial debe ser observable");
    assert.ok(Math.abs(errors[firstOvershoot] - errors[firstOvershoot - 1]) < 0.6,
      "el cruce angular debe ser continuo, sin salto discreto");
    assert.ok(Math.abs(errors.at(-1)!) < 0.1, `la bota no revierte al objetivo: ${errors.at(-1)}`);
  } finally {
    sim.destroy();
  }
});

test("el contacto pie-pie permanece activo durante todo el gesto de levantar y bajar", () => {
  const sim = new Simulation();
  try {
    const idle = emptyInput();
    const hold = { ...idle, kick: 1, kickHeld: true };
    for (let tick = 0; tick < RULES.bootRaiseTicks; tick++) {
      sim.step(hold, hold);
      sim.boots.forEach((boot, i) => {
        if (sim.feet[i].lift > 0) assert.notEqual(boot.collisionFilter.mask & 8, 0, `contacto perdido al subir ${tick}`);
      });
    }
    for (let tick = 0; tick < RULES.bootLowerTicks; tick++) {
      sim.step(idle, idle);
      sim.boots.forEach((boot, i) => {
        if (sim.feet[i].lift > 0) assert.notEqual(boot.collisionFilter.mask & 8, 0, `contacto perdido al bajar ${tick}`);
      });
    }
  } finally {
    sim.destroy();
  }
});

test("los pies levantados ceden entre sí sin atravesarse ni trabar a los jugadores", () => {
  const sim = new Simulation();
  try {
    const hold = { ...emptyInput(), kick: 1, kickHeld: true };
    let closestBoots = Infinity;
    for (let tick = 0; tick < 150; tick++) {
      sim.step({ ...hold, direction: 1 }, { ...hold, direction: -1 });
      closestBoots = Math.min(closestBoots, Math.hypot(
        sim.boots[1].position.x - sim.boots[0].position.x,
        sim.boots[1].position.y - sim.boots[0].position.y,
      ));
    }
    assert.ok(closestBoots > RULES.bootRadius * 1.5, `pies atravesados: distancia mínima ${closestBoots}`);
    assert.ok(Math.abs(sim.players[1].position.x - sim.players[0].position.x) >= 60,
      "el contacto pie-pie debe dejar ceder a ambos jugadores");
  } finally {
    sim.destroy();
  }
});

test("el pivote recupera el sobreimpulso y no se aleja del jugador", () => {
  const sim = new Simulation();
  try {
    const hold = { ...emptyInput(), direction: 1 as const, kick: 1, kickHeld: true };
    for (let tick = 0; tick < 90; tick++) sim.step(hold, { ...hold, direction: -1 });
    for (let tick = 0; tick < 120; tick++) sim.step(emptyInput(), emptyInput());
    sim.boots.forEach((boot, i) => {
      assertFiniteBody(boot, `bota ${i}`);
      const distance = Math.hypot(
        boot.position.x - sim.players[i].position.x,
        boot.position.y - sim.players[i].position.y,
      );
      assert.ok(Math.abs(distance - RULES.bootOrbit) < 3, `pivote ${i} fuera de radio: ${distance}`);
      assert.ok(angleDistance(boot.angle, bootPose(i === 0 ? 1 : 2, sim.feet[i].lift).angle) < 0.65,
        `bota ${i} no recuperó el ángulo: ${boot.angle}`);
    });
  } finally {
    sim.destroy();
  }
});

test("restaurar una instantánea conserva botas y continuación determinista", () => {
  const host = new Simulation();
  const guest = new Simulation();
  try {
    const hold = { ...emptyInput(), direction: 1 as const, kick: 1, kickHeld: true };
    for (let tick = 0; tick < 18; tick++) host.step(hold, emptyInput());
    const state = host.snapshot();
    guest.restore(state);
    const restored = guest.snapshot();
    assert.equal(restored.tick, state.tick);
    assert.deepEqual(restored.feet, state.feet);
    assert.deepEqual(restored.kicks, state.kicks);
    state.players.forEach((expected, i) => assertBodyClose(guest.players[i], host.players[i], `cabeza restaurada ${i}`));
    state.boots.forEach((expected, i) => assertBodyClose(guest.boots[i], host.boots[i], `bota restaurada ${i}`));
    assertBodyClose(guest.ball, host.ball, "pelota restaurada");
    for (let tick = 0; tick < 30; tick++) {
      host.step(emptyInput(), emptyInput());
      guest.step(emptyInput(), emptyInput());
      host.players.forEach((body, i) => assertBodyClose(guest.players[i], body, `cabeza ${i}`, 1e-3));
      host.boots.forEach((body, i) => assertBodyClose(guest.boots[i], body, `bota ${i}`, 1e-3));
      assertBodyClose(guest.ball, host.ball, "pelota", 1e-3);
    }
  } finally {
    host.destroy();
    guest.destroy();
  }
});

test("el estado de cada bota expone la transformación dinámica para dibujarla", () => {
  const sim = new Simulation();
  try {
    const hold = { ...emptyInput(), kick: 1, kickHeld: true };
    for (let tick = 0; tick < RULES.bootRaiseTicks + 2; tick++) sim.step(hold, emptyInput());
    const state = sim.snapshot();
    state.boots.forEach((boot, i) => {
      assert.equal(boot.x, sim.boots[i].position.x);
      assert.equal(boot.y, sim.boots[i].position.y);
      assert.equal(boot.angle, sim.boots[i].angle);
      assertFiniteBody(sim.boots[i], `bota visual ${i}`);
    });
  } finally {
    sim.destroy();
  }
});

test("el estrés de entradas no produce NaN ni túneles de pelota", () => {
  const sim = new Simulation();
  try {
    for (let tick = 0; tick < 600; tick++) {
      const first = { ...emptyInput(), direction: (tick % 3 === 0 ? 1 : -1) as -1 | 1, kick: tick + 1, kickHeld: tick % 5 < 3 };
      const second = { ...emptyInput(), direction: (tick % 4 === 0 ? -1 : 1) as -1 | 1, kick: tick + 1, kickHeld: tick % 7 < 4 };
      sim.step(first, second);
      [...sim.players, ...sim.boots, sim.ball].forEach((body, i) => assertFiniteBody(body, `cuerpo ${i} tick ${tick}`));
      assert.ok(sim.ball.position.x >= RULES.ballRadius - 0.01 && sim.ball.position.x <= 1024 - RULES.ballRadius + 0.01,
        `pelota atravesó una pared en tick ${tick}`);
      assert.ok(sim.ball.position.y <= PITCH_FLOOR_Y + 0.01, `pelota atravesó el piso en tick ${tick}`);
    }
  } finally {
    sim.destroy();
  }
});
