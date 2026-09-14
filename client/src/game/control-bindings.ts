export const CONTROL_BINDINGS_STORAGE_KEY = "footyhead.control-bindings";
export const CONTROL_BINDINGS_VERSION = 1;

export const CONTROL_ACTIONS = ["left", "right", "jump", "kick"] as const;
export type ControlAction = (typeof CONTROL_ACTIONS)[number];

export type ControlBindings = Record<ControlAction, string>;

export const DEFAULT_CONTROL_BINDINGS: Readonly<ControlBindings> = Object.freeze({
  left: "ArrowLeft",
  right: "ArrowRight",
  jump: "ArrowUp",
  kick: "Space",
});

export interface ControlStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const CONTROL_CODES: Record<string, string> = {
  ArrowLeft: "LEFT",
  ArrowRight: "RIGHT",
  ArrowUp: "UP",
  ArrowDown: "DOWN",
  Space: "SPACE",
  Backspace: "BACKSPACE",
  Tab: "TAB",
  Enter: "ENTER",
  ShiftLeft: "SHIFT",
  ShiftRight: "SHIFT",
  ControlLeft: "CTRL",
  ControlRight: "CTRL",
  AltLeft: "ALT",
  AltRight: "ALT",
  Pause: "PAUSE",
  CapsLock: "CAPS_LOCK",
  Escape: "ESC",
  PageUp: "PAGE_UP",
  PageDown: "PAGE_DOWN",
  End: "END",
  Home: "HOME",
  PrintScreen: "PRINT_SCREEN",
  Insert: "INSERT",
  Delete: "DELETE",
  Semicolon: "SEMICOLON",
  Equal: "PLUS",
  Comma: "COMMA",
  Minus: "MINUS",
  Period: "PERIOD",
  Slash: "FORWARD_SLASH",
  Backslash: "BACK_SLASH",
  Quote: "QUOTES",
  Backquote: "BACKTICK",
  BracketLeft: "OPEN_BRACKET",
  BracketRight: "CLOSED_BRACKET",
};

const DIGIT_NAMES = ["ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE"];

function getStorage(): ControlStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isControlAction(value: unknown): value is ControlAction {
  return typeof value === "string" && (CONTROL_ACTIONS as readonly string[]).includes(value);
}

/** Return the Phaser key name for a DOM KeyboardEvent.code. */
export function controlKeyCode(code: string): string | null {
  if (CONTROL_CODES[code]) return CONTROL_CODES[code];
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return DIGIT_NAMES[Number(digit[1])];
  const functionKey = /^F([1-9]|1[0-2])$/.exec(code);
  if (functionKey) return functionKey[0];
  const numpadDigit = /^Numpad([0-9])$/.exec(code);
  if (numpadDigit) return `NUMPAD_${DIGIT_NAMES[Number(numpadDigit[1])]}`;
  if (code === "NumpadAdd") return "NUMPAD_ADD";
  if (code === "NumpadSubtract") return "NUMPAD_SUBTRACT";
  return null;
}

export function isSupportedControlKey(code: unknown): code is string {
  return typeof code === "string" && controlKeyCode(code) !== null;
}

function isValidBindings(value: unknown): value is ControlBindings {
  if (!value || typeof value !== "object") return false;
  const bindings = value as Record<string, unknown>;
  if (!CONTROL_ACTIONS.every(action => isControlAction(action) && isSupportedControlKey(bindings[action]))) return false;
  const keys = CONTROL_ACTIONS.map(action => bindings[action] as string);
  const phaserKeys = keys.map(key => controlKeyCode(key));
  return new Set(keys).size === CONTROL_ACTIONS.length
    && new Set(phaserKeys).size === CONTROL_ACTIONS.length;
}

export function loadControlBindings(storage: ControlStorage | null = getStorage()): ControlBindings {
  if (!storage) return { ...DEFAULT_CONTROL_BINDINGS };
  try {
    const raw = storage.getItem(CONTROL_BINDINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONTROL_BINDINGS };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_CONTROL_BINDINGS };
    const envelope = parsed as { version?: unknown; bindings?: unknown };
    if (envelope.version !== CONTROL_BINDINGS_VERSION || !isValidBindings(envelope.bindings)) {
      return { ...DEFAULT_CONTROL_BINDINGS };
    }
    return { ...envelope.bindings };
  } catch {
    return { ...DEFAULT_CONTROL_BINDINGS };
  }
}

export const getControlBindings = loadControlBindings;

export function saveControlBindings(bindings: ControlBindings, storage: ControlStorage | null = getStorage()): boolean {
  if (!storage || !isValidBindings(bindings)) return false;
  try {
    storage.setItem(CONTROL_BINDINGS_STORAGE_KEY, JSON.stringify({
      version: CONTROL_BINDINGS_VERSION,
      bindings: { ...bindings },
    }));
    return true;
  } catch {
    return false;
  }
}

export function resetControlBindings(storage: ControlStorage | null = getStorage()): boolean {
  return saveControlBindings({ ...DEFAULT_CONTROL_BINDINGS }, storage);
}

export type BindingUpdate =
  | { ok: true; bindings: ControlBindings }
  | { ok: false; reason: "unsupported" | "conflict" | "invalid"; conflict?: ControlAction };

/** Apply one assignment while keeping every action on a distinct supported key. */
export function assignControlBinding(bindings: ControlBindings, action: ControlAction, code: string): BindingUpdate {
  if (!isValidBindings(bindings) || !isControlAction(action)) return { ok: false, reason: "invalid" };
  if (!isSupportedControlKey(code)) return { ok: false, reason: "unsupported" };
  const phaserCode = controlKeyCode(code);
  const conflict = CONTROL_ACTIONS.find(other => other !== action && controlKeyCode(bindings[other]) === phaserCode);
  if (conflict) return { ok: false, reason: "conflict", conflict };
  return { ok: true, bindings: { ...bindings, [action]: code } };
}

export function controlKeyLabel(code: string): string {
  const labels: Record<string, string> = {
    ArrowLeft: "Flecha izquierda",
    ArrowRight: "Flecha derecha",
    ArrowUp: "Flecha arriba",
    ArrowDown: "Flecha abajo",
    Space: "Barra espaciadora",
    Backspace: "Retroceso",
    Tab: "Tabulador",
    Enter: "Enter",
    Escape: "Escape",
    ShiftLeft: "Shift izquierdo",
    ShiftRight: "Shift derecho",
    ControlLeft: "Ctrl izquierdo",
    ControlRight: "Ctrl derecho",
    AltLeft: "Alt izquierdo",
    AltRight: "Alt derecho",
    PageUp: "Página arriba",
    PageDown: "Página abajo",
    PrintScreen: "Imprimir pantalla",
    Delete: "Suprimir",
  };
  if (labels[code]) return labels[code];
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return digit[1];
  const functionKey = /^F([1-9]|1[0-2])$/.exec(code);
  if (functionKey) return functionKey[0];
  const numpadDigit = /^Numpad([0-9])$/.exec(code);
  if (numpadDigit) return `Teclado numérico ${numpadDigit[1]}`;
  return code;
}

export function controlHint(bindings: ControlBindings): string {
  return `Mover: ${controlKeyLabel(bindings.left)} / ${controlKeyLabel(bindings.right)} · Saltar: ${controlKeyLabel(bindings.jump)} · Patear: ${controlKeyLabel(bindings.kick)}`;
}
