import assert from "node:assert/strict";
import test from "node:test";
import { GAME_STAGE_WIDTH, REFERENCE_STAGE_WIDTH, REFERENCE_VISUALS, VISUALS } from "../client/src/game/visual-proportions";

test("gameplay objects retain the reference game's proportions", () => {
  const expectedScale = GAME_STAGE_WIDTH / REFERENCE_STAGE_WIDTH;

  for (const name of ["player", "boot", "ball", "goal"] as const) {
    const widthScale = VISUALS[name].width / REFERENCE_VISUALS[name].width;
    const heightScale = VISUALS[name].height / REFERENCE_VISUALS[name].height;
    assert.ok(Math.abs(widthScale - expectedScale) < 0.001, `${name} width scale is ${widthScale}, expected ${expectedScale}`);
    assert.ok(Math.abs(heightScale - expectedScale) < 0.001, `${name} height scale is ${heightScale}, expected ${expectedScale}`);
  }
});
