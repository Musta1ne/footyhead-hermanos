import { Scene } from "phaser";

export const ARCADE_FONT = "Impact, Arial Black, sans-serif";

/** Decorative scenery only. Goal posts and turf align with Simulation's existing bodies. */
export function drawStadium(scene: Scene) {
  const g = scene.add.graphics();
  g.fillGradientStyle(0x85bfd0, 0x85bfd0, 0xc1ded4, 0xc1ded4);
  g.fillRect(0, 0, 1024, 590);

  // Open stadium roof, with the same pale concrete and teal bands as the menu.
  g.fillStyle(0xe9ece1);
  for (let x = 35; x < 1024; x += 114) {
    g.fillTriangle(x, 187, x - 8, 330, x + 8, 330);
  }
  g.lineStyle(2, 0xe5eee3, 0.85);
  g.lineBetween(0, 233, 1024, 233);
  g.fillStyle(0xe4e7dc).fillRect(0, 312, 1024, 17);

  // Deterministic pixel spectators, drawn once rather than on every game tick.
  const shirts = [0x879b89, 0xb6867b, 0xd5c68e, 0x6c93a6, 0xc3beb3, 0x8a829a];
  const skins = [0xe4c6a0, 0xd4aa83, 0xb98769, 0xf0d8b1];
  for (const [top, rows] of [[332, 3], [420, 4]]) {
    g.fillStyle(0x96928b).fillRect(0, top - 3, 1024, rows * 17 + 8);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < 77; col++) {
        const x = col * 14 + (row % 2) * 6;
        const y = top + row * 17;
        const seed = col * 7 + row * 13 + top;
        g.fillStyle(shirts[seed % shirts.length]).fillRect(x - 3, y + 6, 8, 9);
        g.fillStyle(skins[seed % skins.length]).fillRect(x - 2, y, 6, 6);
        g.fillStyle(0xe7d7b4, 0.7).fillRect(x - 5, y + 7, 2, 6);
      }
    }
    g.fillStyle(0xd9ddd3).fillTriangle(250, top - 3, 190, top + rows * 17 + 7, 217, top + rows * 17 + 7);
    g.fillTriangle(774, top - 3, 807, top + rows * 17 + 7, 834, top + rows * 17 + 7);
  }
  for (const y of [392, 495]) {
    g.fillStyle(0xe8e8de).fillRect(0, y, 1024, 15);
    g.fillStyle(0xa6c7b5).fillRect(30, y, 190, 15).fillRect(432, y, 160, 15).fillRect(804, y, 190, 15);
  }
  g.fillStyle(0x657a70).fillRect(0, 407, 1024, 6);

  g.fillStyle(0x9eba72).fillRect(0, 510, 1024, 80);
  for (let x = -120; x < 1150; x += 180) {
    g.fillStyle(0xafc781).fillPoints([{ x: x + 55, y: 511 }, { x: x + 145, y: 511 }, { x: x + 90, y: 590 }, { x, y: 590 }], true);
  }
  g.lineStyle(2, 0xe6edcb, 0.85);
  g.strokePoints([{ x: 115, y: 516 }, { x: 909, y: 516 }, { x: 1000, y: 584 }, { x: 24, y: 584 }], true);
  g.lineBetween(512, 516, 512, 584);
  g.strokeEllipse(512, 544, 225, 30);
  g.strokePoints([{ x: 96, y: 527 }, { x: 211, y: 527 }, { x: 168, y: 565 }, { x: 47, y: 565 }], true);
  g.strokePoints([{ x: 928, y: 527 }, { x: 813, y: 527 }, { x: 856, y: 565 }, { x: 977, y: 565 }], true);

  // The physical floor starts at y=590. Keep the visible touchline on that edge.
  g.fillStyle(0x314f20).fillRect(0, 590, 1024, 10);
  g.fillStyle(0xc0d38c).fillRect(0, 590, 1024, 3);
  g.fillGradientStyle(0x688632, 0x688632, 0x243d1b, 0x243d1b);
  g.fillRect(0, 600, 1024, 168);
  g.lineStyle(2, 0xa8bd76).lineBetween(0, 603, 1024, 603);
  g.lineStyle(1, 0xbac594, 0.65).lineBetween(326, 616, 326, 678).lineBetween(696, 616, 696, 678);
  g.fillStyle(0x15281b, 0.65).fillRect(0, 692, 1024, 76);

  // Black corner scoreboards echo the classic Sports Heads frame.
  g.fillStyle(0x17211d).fillPoints([{ x: 0, y: 0 }, { x: 306, y: 0 }, { x: 159, y: 33 }, { x: 33, y: 144 }, { x: 0, y: 310 }], true);
  g.fillPoints([{ x: 1024, y: 0 }, { x: 718, y: 0 }, { x: 865, y: 33 }, { x: 991, y: 144 }, { x: 1024, y: 310 }], true);
  g.lineStyle(5, 0x7a8c79, 0.7).lineBetween(0, 2, 306, 2).lineBetween(718, 2, 1024, 2);
  scene.add.text(18, 16, "IZQUIERDA", { fontFamily: ARCADE_FONT, fontSize: 25, color: "#ff6549" });
  scene.add.text(1006, 16, "DERECHA", { fontFamily: ARCADE_FONT, fontSize: 25, color: "#ff6549" }).setOrigin(1, 0);

  scene.add.text(22, 622, "← →  MOVERSE     ↑  SALTAR", { fontFamily: ARCADE_FONT, fontSize: 20, color: "#f6f3da" });
  scene.add.text(22, 652, "ESPACIO  ·  PATEAR", { fontFamily: ARCADE_FONT, fontSize: 20, color: "#f6f3da" });
  scene.add.text(511, 627, "FOOTY HEAD", { fontFamily: ARCADE_FONT, fontSize: 26, color: "#fff5da", stroke: "#233021", strokeThickness: 4 }).setOrigin(0.5);
  scene.add.text(511, 657, "HERMANOS", { fontFamily: ARCADE_FONT, fontSize: 29, color: "#ffe52b", stroke: "#233021", strokeThickness: 4 }).setOrigin(0.5);
  scene.add.text(860, 632, "1 MINUTO", { fontFamily: ARCADE_FONT, fontSize: 25, color: "#f6f3da" }).setOrigin(0.5);
  scene.add.text(860, 661, "EL CLÁSICO · 1 VS 1", { fontFamily: ARCADE_FONT, fontSize: 18, color: "#e1e8c9" }).setOrigin(0.5);
}

export function drawGoal(scene: Scene, right: boolean) {
  const g = scene.add.graphics();
  const x = (value: number) => right ? 1024 - value : value;
  g.fillStyle(0xeaf0dd, 0.15).fillRect(right ? 944 : 4, 465, 76, 125);
  g.lineStyle(1, 0xf9f7e4, 0.9);
  for (let col = 8; col < 80; col += 12) g.lineBetween(x(col), 467, x(col), 589);
  for (let row = 478; row < 590; row += 15) g.lineBetween(x(5), row, x(78), row);
  g.lineStyle(8, 0x25342c).lineBetween(x(80), 465, x(80), 590).lineBetween(x(4), 465, x(80), 465);
  g.lineStyle(4, 0xf5f3da).lineBetween(x(80), 465, x(80), 590).lineBetween(x(4), 465, x(80), 465);
  g.lineStyle(3, 0x657466).lineBetween(x(4), 465, x(4), 590);
}

