import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_KEY_BINDINGS,
  KEY_BINDINGS_STORAGE_KEY,
  formatControlsHint,
  isValidKeyCode,
  loadKeyBindings,
  saveKeyBindings,
  subscribeKeyBindings,
  toPhaserKeyCode,
} from "../client/src/game/keys";

function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() { return entries.size; },
    clear() { entries.clear(); },
    getItem(key) { return entries.get(key) ?? null; },
    key(index) { return [...entries.keys()][index] ?? null; },
    removeItem(key) { entries.delete(key); },
    setItem(key, value) { entries.set(key, value); },
  };
}

test("las teclas guardadas controlan el juego y actualizan las indicaciones", () => {
  const storage = memoryStorage();
  const observed: string[] = [];
  const unsubscribe = subscribeKeyBindings(bindings => observed.push(formatControlsHint(bindings)));
  try {
    const bindings = saveKeyBindings({ left: "KeyA", right: "KeyD", jump: "KeyW", kick: "KeyK" }, storage);
    assert.deepEqual(loadKeyBindings(storage), bindings);
    assert.equal(storage.getItem(KEY_BINDINGS_STORAGE_KEY), JSON.stringify(bindings));
    assert.match(observed.at(-1) ?? "", /A \/ D.*W.*K/);
    assert.equal(toPhaserKeyCode(bindings.left), 65);
  } finally { unsubscribe(); }
});

test("datos persistidos inválidos o duplicados restauran asignaciones utilizables", () => {
  const storage = memoryStorage();
  storage.setItem(KEY_BINDINGS_STORAGE_KEY, JSON.stringify({ left: "KeyA", right: "KeyA", jump: "F5", kick: "Space" }));
  const bindings = loadKeyBindings(storage);
  assert.equal(bindings.left, "KeyA");
  assert.equal(new Set(Object.values(bindings)).size, 4);
  assert.ok(Object.values(bindings).every(isValidKeyCode));
  assert.equal(isValidKeyCode("ControlLeft"), false);
  assert.equal(isValidKeyCode("F5"), false);
  storage.setItem(KEY_BINDINGS_STORAGE_KEY, "{");
  assert.deepEqual(loadKeyBindings(storage), DEFAULT_KEY_BINDINGS);
});
