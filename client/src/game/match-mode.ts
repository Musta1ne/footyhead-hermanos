export const MATCH_MODES = ["timed", "first-to-seven", "practice"] as const;
export type MatchMode = typeof MATCH_MODES[number];
export function isMatchMode(value: unknown): value is MatchMode {
  return MATCH_MODES.includes(value as MatchMode);
}
