export const CONTROL_ACTIONS = ["left", "right", "jump", "kick"] as const;
export type ControlAction = (typeof CONTROL_ACTIONS)[number];

export type KeyBindings = Record<ControlAction, string>;

export const DEFAULT_KEY_BINDINGS: Readonly<KeyBindings> = Object.freeze({
  left: "ArrowLeft",
  right: "ArrowRight",
  jump: "ArrowUp",
  kick: "Space",
});

export const KEY_BINDINGS_STORAGE_KEY = "footyhead:key-bindings";

const STATIC_KEY_CODES = new Set([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space",
  "Backquote", "Minus", "Equal", "BracketLeft", "BracketRight", "Backslash",
  "Semicolon", "Quote", "Comma", "Period", "Slash",
]);

const DISPLAY_NAMES: Record<string, string> = {
  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Space: "Espacio",
  Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]",
  Backslash: "\\", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/",
};

const PHASER_KEY_CODES: Record<string, number> = {
  ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Space: 32,
  Backquote: 192, Minus: 189, Equal: 187, BracketLeft: 219, BracketRight: 221,
  Backslash: 220, Semicolon: 186, Quote: 222, Comma: 188, Period: 190, Slash: 191,
};

/** Returns whether a DOM KeyboardEvent.code is supported by the game. */
export function isValidKeyCode(value: unknown): value is string {
  return typeof value === "string" && (STATIC_KEY_CODES.has(value)
    || /^Key[A-Z]$/.test(value)
    || /^Digit[0-9]$/.test(value)
    || /^Numpad(?:[0-9]|Add|Subtract|Multiply|Divide|Decimal)$/.test(value));
}

/** Converts a DOM code to the numeric code Phaser's keyboard plugin expects. */
export function toPhaserKeyCode(code: string): number {
  if (PHASER_KEY_CODES[code] !== undefined) return PHASER_KEY_CODES[code];
  if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3);
  if (/^Digit[0-9]$/.test(code)) return code.charCodeAt(5);
  if (/^Numpad[0-9]$/.test(code)) return 96 + Number(code.slice(6));
  if (code === "NumpadDecimal") return 110;
  if (code === "NumpadMultiply") return 106;
  if (code === "NumpadAdd") return 107;
  if (code === "NumpadSubtract") return 109;
  if (code === "NumpadDivide") return 111;
  return 0;
}

/** A short, readable label for a key in buttons, tutorials, and status text. */
export function formatKey(code: string): string {
  if (DISPLAY_NAMES[code]) return DISPLAY_NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return `Num ${code.slice(6)}`;
  if (code === "NumpadDecimal") return "Num .";
  if (code === "NumpadMultiply") return "Num *";
  if (code === "NumpadAdd") return "Num +";
  if (code === "NumpadSubtract") return "Num -";
  if (code === "NumpadDivide") return "Num /";
  return "Tecla inválida";
}

/** The contextual tutorial used by the menu and the Phaser game status. */
export function formatControlsHint(bindings: KeyBindings): string {
  return `Movete con ${formatKey(bindings.left)} / ${formatKey(bindings.right)} · Saltá con ${formatKey(bindings.jump)} · Pateá con ${formatKey(bindings.kick)}.`;
}

function valueFrom(source: unknown): Partial<KeyBindings> {
  return source && typeof source === "object" ? source as Partial<KeyBindings> : {};
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}

/** Sanitizes persisted data and fills missing or conflicting actions safely. */
export function normalizeKeyBindings(source: unknown): KeyBindings {
  const input = valueFrom(source);
  const result = {} as KeyBindings;
  const used = new Set<string>();

  for (const action of CONTROL_ACTIONS) {
    const candidate = input[action];
    if (isValidKeyCode(candidate) && !used.has(candidate)) {
      result[action] = candidate;
      used.add(candidate);
      continue;
    }

    const fallback = CONTROL_ACTIONS
      .map(name => DEFAULT_KEY_BINDINGS[name])
      .find(code => !used.has(code))
      ?? ["ArrowLeft", "ArrowRight", "ArrowUp", "Space", "KeyA", "KeyD", "KeyW", "KeyS"]
        .find(code => !used.has(code))!;
    result[action] = fallback;
    used.add(fallback);
  }

  return result;
}

function readStorage(storage?: Storage | null): unknown {
  const source = storage ?? browserStorage();
  if (!source) return null;
  try {
    const value = source.getItem(KEY_BINDINGS_STORAGE_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export function loadKeyBindings(storage?: Storage | null): KeyBindings {
  return normalizeKeyBindings(readStorage(storage));
}

type KeyBindingsListener = (bindings: KeyBindings) => void;
const listeners = new Set<KeyBindingsListener>();
let storageListenerInstalled = false;

function notify(bindings: KeyBindings) {
  listeners.forEach(listener => listener(bindings));
}

function installStorageListener() {
  if (storageListenerInstalled || typeof window === "undefined") return;
  window.addEventListener("storage", event => {
    if (event.key !== null && event.key !== KEY_BINDINGS_STORAGE_KEY) return;
    let source: unknown = null;
    try { source = event.newValue ? JSON.parse(event.newValue) : null; } catch { /* defaults below */ }
    notify(normalizeKeyBindings(source));
  });
  storageListenerInstalled = true;
}

export function subscribeKeyBindings(listener: KeyBindingsListener): () => void {
  installStorageListener();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function saveKeyBindings(bindings: unknown, storage?: Storage | null): KeyBindings {
  const next = normalizeKeyBindings(bindings);
  const target = storage ?? browserStorage();
  if (target) {
    try { target.setItem(KEY_BINDINGS_STORAGE_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  }
  notify(next);
  return next;
}

export function resetKeyBindings(storage?: Storage | null): KeyBindings {
  return saveKeyBindings(DEFAULT_KEY_BINDINGS, storage);
}
