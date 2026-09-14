import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assignControlBinding,
  CONTROL_BINDINGS_STORAGE_KEY,
  CONTROL_BINDINGS_VERSION,
  DEFAULT_CONTROL_BINDINGS,
  controlHint,
  controlKeyCode,
  loadControlBindings,
  saveControlBindings,
} from "../client/src/game/control-bindings";

test("mapea códigos DOM a nombres de Phaser y conserva una ayuda legible", () => {
  assert.equal(controlKeyCode("KeyA"), "A");
  assert.equal(controlKeyCode("Digit7"), "SEVEN");
  assert.equal(controlKeyCode("Numpad1"), "NUMPAD_ONE");
  assert.equal(controlKeyCode("AudioVolumeUp"), null);
  assert.equal(controlHint({ left: "KeyA", right: "KeyD", jump: "KeyW", kick: "Space" }),
    "Mover: A / D · Saltar: W · Patear: Barra espaciadora");
});

const storage = (value: string | null = null) => {
  let stored = value;
  return {
    getItem: () => stored,
    setItem: (_key: string, next: string) => { stored = next; },
    read: () => stored,
  };
};

test("controles usa predeterminados y tolera almacenamiento malformado o viejo", () => {
  const malformed = storage("not-json");
  assert.deepEqual(loadControlBindings(malformed), DEFAULT_CONTROL_BINDINGS);
  const stale = storage(JSON.stringify({ version: 0, bindings: DEFAULT_CONTROL_BINDINGS }));
  assert.deepEqual(loadControlBindings(stale), DEFAULT_CONTROL_BINDINGS);
  const duplicate = storage(JSON.stringify({ version: CONTROL_BINDINGS_VERSION, bindings: { ...DEFAULT_CONTROL_BINDINGS, kick: "ArrowLeft" } }));
  assert.deepEqual(loadControlBindings(duplicate), DEFAULT_CONTROL_BINDINGS);
});

test("guardar controles escribe un esquema versionado y evita conflictos", () => {
  const target = storage();
  const bindings = { ...DEFAULT_CONTROL_BINDINGS, left: "KeyA" };
  assert.equal(saveControlBindings(bindings, target), true);
  assert.deepEqual(JSON.parse(target.read()!), { version: CONTROL_BINDINGS_VERSION, bindings });
  assert.equal(JSON.parse(target.read()!)["bindings"].left, "KeyA");
  const conflict = assignControlBinding(bindings, "kick", "KeyA");
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.reason, "conflict");
  const unsupported = assignControlBinding(bindings, "kick", "AudioVolumeUp");
  assert.equal(unsupported.ok, false);
});

test("modificadores que comparten keycode de Phaser también entran en conflicto", () => {
  const bindings = { ...DEFAULT_CONTROL_BINDINGS, left: "ShiftLeft" };
  const conflict = assignControlBinding(bindings, "kick", "ShiftRight");
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.reason, "conflict");
  assert.equal(CONTROL_BINDINGS_STORAGE_KEY, "footyhead.control-bindings");
});
