export const REFERENCE_STAGE_WIDTH = 800;
export const GAME_STAGE_WIDTH = 1024;
export const VISUAL_SCALE = GAME_STAGE_WIDTH / REFERENCE_STAGE_WIDTH;
export const PITCH_FLOOR_Y = 590;

// Native dimensions used by the 800 px-wide reference game.
export const REFERENCE_VISUALS = {
  player: { width: 50, height: 50 },
  boot: { width: 18, height: 19 },
  ball: { width: 20, height: 20 },
  goal: { width: 80, height: 125 },
} as const;

export const VISUALS = {
  player: { width: REFERENCE_VISUALS.player.width * VISUAL_SCALE, height: REFERENCE_VISUALS.player.height * VISUAL_SCALE },
  boot: { width: REFERENCE_VISUALS.boot.width * VISUAL_SCALE, height: REFERENCE_VISUALS.boot.height * VISUAL_SCALE },
  ball: { width: REFERENCE_VISUALS.ball.width * VISUAL_SCALE, height: REFERENCE_VISUALS.ball.height * VISUAL_SCALE },
  goal: { width: REFERENCE_VISUALS.goal.width * VISUAL_SCALE, height: REFERENCE_VISUALS.goal.height * VISUAL_SCALE },
} as const;
