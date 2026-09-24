export const POWERUP_TYPES = [
  "speed-up", "speed-down", "jump-up", "jump-down",
  "ice-opponent", "ice-self", "goal-big", "goal-small",
  "grow", "shrink", "leg-self", "leg-opponent",
] as const;

export type PowerupType = typeof POWERUP_TYPES[number];
export type EffectGroup = "speed" | "jump" | "ice" | "goal" | "size" | "leg";
export type Powerup = { id: number; type: PowerupType; x: number; y: number; remainingTicks: number };
export type ActiveEffect = { type: PowerupType; target: 1 | 2; remainingTicks: number };

export const POWERUP_RULES = {
  spawnTicks: 8 * 60,
  lifeTicks: 13 * 60,
  effectTicks: 5 * 60,
  maxVisible: 3,
  radius: 18,
  speedUp: 1.4,
  speedDown: 0.6,
  jumpUp: 1.3,
  jumpDown: 0.7,
  goalBig: 1.4,
  goalSmall: 0.7,
  grow: 1.35,
  shrink: 0.75,
  bigKickDuration: 1.25,
} as const;

export const POWERUP_DISPLAY: Record<PowerupType, {
  label: string; icon: string; beneficial: boolean; activeLabel?: string; activeHarmful?: boolean;
}> = {
  "speed-up": { label: "Velocidad +", icon: "R+", beneficial: true },
  "speed-down": { label: "Velocidad −", icon: "R−", beneficial: false },
  "jump-up": { label: "Salto +", icon: "S+", beneficial: true },
  "jump-down": { label: "Salto −", icon: "S−", beneficial: false },
  "ice-opponent": { label: "Congelar rival", icon: "H★", beneficial: true, activeLabel: "Congelado", activeHarmful: true },
  "ice-self": { label: "Congelarte", icon: "H×", beneficial: false, activeLabel: "Congelado" },
  "goal-big": { label: "Arco grande", icon: "A+", beneficial: true, activeHarmful: true },
  "goal-small": { label: "Arco chico", icon: "A−", beneficial: false, activeHarmful: false },
  "grow": { label: "Crecer", icon: "T+", beneficial: true },
  "shrink": { label: "Achicarse", icon: "T−", beneficial: false },
  "leg-self": { label: "Pierna rota", icon: "P×", beneficial: false, activeLabel: "Sin patada" },
  "leg-opponent": { label: "Romper pierna rival", icon: "P★", beneficial: true, activeLabel: "Sin patada", activeHarmful: true },
};

export function isPowerupType(value: unknown): value is PowerupType {
  return typeof value === "string" && POWERUP_TYPES.includes(value as PowerupType);
}

export function effectGroup(type: PowerupType): EffectGroup {
  if (type.startsWith("speed")) return "speed";
  if (type.startsWith("jump")) return "jump";
  if (type.startsWith("ice")) return "ice";
  if (type.startsWith("goal")) return "goal";
  if (type === "grow" || type === "shrink") return "size";
  return "leg";
}

export function seedFromRoom(pin: string): number {
  let hash = 2166136261;
  for (const char of pin) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0 || 1;
}
