import { test } from "node:test";
import assert from "node:assert/strict";
import { rememberRoom, roomIdentity } from "../client/src/game/identity";
import { Peer } from "../client/src/game/peer";

const storage = (data = new Map<string, string>()) => ({ getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } });
test("una red congestionada no acumula estados viejos y conserva el canal de control", () => {
  const sent: unknown[] = [];
  const peer = new Peer("BUFFER", () => {}, () => {});
  peer.fast = { readyState: "open", bufferedAmount: 1000, send: (value: unknown) => sent.push(value), close() {} } as any;
  peer.control = { readyState: "open", bufferedAmount: 0, send: (value: unknown) => sent.push(value), close() {} } as any;
  peer.send({ type: "input", seq: 1 });
  peer.send({ type: "visibility", hidden: true }, true);
  assert.equal(sent.length, 1);
  assert.equal(JSON.parse(sent[0] as string).type, "visibility");
  Object.assign(peer.fast!, { bufferedAmount: 0 });
  peer.send({ type: "input", seq: 2 });
  assert.equal(JSON.parse(sent[1] as string).seq, 2);
  peer.close();
});
test("la credencial del creador sobrevive otra pestaña sin compartirse en la invitación", () => {
  const local = Object.getOwnPropertyDescriptor(globalThis, "localStorage"), session = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  try {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage() });
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: storage() });
    const token = "1".repeat(32);
    rememberRoom("ROOM", token);
    // Otra pestaña puede incluso contener un token incorrecto de una visita anterior.
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: storage(new Map([["room:ROOM", "2".repeat(32)]])) });
    assert.equal(roomIdentity("ROOM"), token);
    // El otro navegador sólo recibe el PIN público.
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage() });
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: storage() });
    const guest = roomIdentity("ROOM");
    assert.notEqual(guest, token);
    assert.equal(roomIdentity("ROOM"), guest);
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
    assert.equal(roomIdentity("ROOM"), guest);
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, get() { throw new Error("blocked"); } });
    assert.throws(() => rememberRoom("ROOM", token), /almacenamiento/);
  } finally {
    for (const [name, descriptor] of [["localStorage", local], ["sessionStorage", session]] as const) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete (globalThis as any)[name];
    }
  }
});

test("una pestaña duplicada no llega a sobrescribir la señalización y al cerrar se libera la sala", async () => {
  const session = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const locks = Object.getOwnPropertyDescriptor(navigator, "locks");
  const fetch = globalThis.fetch;
  let held = false, joins = 0;
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: storage() });
  Object.defineProperty(navigator, "locks", { configurable: true, value: {
    async request(_name: string, _options: unknown, callback: (lock: unknown) => Promise<void>) {
      if (held) return callback(null);
      held = true;
      try { await callback({}); } finally { held = false; }
    },
  } });
  globalThis.fetch = async () => { joins++; return new Promise(() => {}); };
  const errors: string[] = [];
  const first = new Peer("ROOM", () => {}, message => errors.push(message));
  const second = new Peer("ROOM", () => {}, message => errors.push(message));
  try {
    void first.connect();
    await new Promise(resolve => setTimeout(resolve, 0));
    await second.connect();
    assert.equal(joins, 1);
    assert.match(errors[0], /otra pestaña/);
    first.close();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(held, false);
  } finally {
    first.close(); second.close(); globalThis.fetch = fetch;
    if (session) Object.defineProperty(globalThis, "sessionStorage", session); else delete (globalThis as any).sessionStorage;
    if (locks) Object.defineProperty(navigator, "locks", locks); else delete (navigator as any).locks;
  }
});
