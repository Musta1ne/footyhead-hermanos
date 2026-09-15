export const REFERENCE_STAGE_WIDTH = 800;
export const GAME_STAGE_WIDTH = 1024;
export const VISUAL_SCALE = GAME_STAGE_WIDTH / REFERENCE_STAGE_WIDTH;
export const PITCH_FLOOR_Y = 590;

export const STADIUM_CORNERS = {
  left: [{ x: 0, y: 0 }, { x: 306, y: 0 }, { x: 159, y: 33 }, { x: 33, y: 144 }, { x: 0, y: 310 }],
  right: [{ x: 1024, y: 0 }, { x: 718, y: 0 }, { x: 865, y: 33 }, { x: 991, y: 144 }, { x: 1024, y: 310 }],
} as const;

// Cada segmento está orientado para que su normal derecha apunte hacia la cancha.
export const ARENA_SLOPES = [
  [STADIUM_CORNERS.left[1], STADIUM_CORNERS.left[2]],
  [STADIUM_CORNERS.left[2], STADIUM_CORNERS.left[3]],
  [STADIUM_CORNERS.left[3], STADIUM_CORNERS.left[4]],
  [STADIUM_CORNERS.right[4], STADIUM_CORNERS.right[3]],
  [STADIUM_CORNERS.right[3], STADIUM_CORNERS.right[2]],
  [STADIUM_CORNERS.right[2], STADIUM_CORNERS.right[1]],
] as const;

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
