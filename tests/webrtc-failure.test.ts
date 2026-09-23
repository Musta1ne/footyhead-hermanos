import { test } from "node:test";
import assert from "node:assert/strict";
import { Peer } from "../client/src/game/peer";

test("si WebRTC falla, informa el error sin enviar la partida por HTTPS", { timeout: 10_000 }, async () => {
  const originalFetch = globalThis.fetch, originalRTC = globalThis.RTCPeerConnection;
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const storage = new Map<string, string>([["room:TEST", "1".repeat(32)]]);
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { getItem: (k: string) => storage.get(k), setItem: (k: string, v: string) => storage.set(k, v) } });
  globalThis.RTCPeerConnection = class {
    connectionState = "new";
    localDescription: unknown = null;
    remoteDescription: unknown = null;
    onconnectionstatechange?: () => void;
    createDataChannel(label: string) { return { label, readyState: "connecting", close() {} }; }
    async createOffer() { return { type: "offer", sdp: "v=0" }; }
    async createAnswer() { return { type: "answer", sdp: "v=0" }; }
    async setLocalDescription(value: unknown) { this.localDescription = value; }
    async setRemoteDescription(value: unknown) { this.remoteDescription = value; this.connectionState = "failed"; this.onconnectionstatechange?.(); }
    close() {}
  } as any;
  const descriptions: unknown[] = [null, null];
  const requests: string[] = [];
  globalThis.fetch = async (url, options) => {
    const path = String(url);
    requests.push(path);
    if (path.endsWith("/ice")) return Response.json({ iceServers: [], turnAvailable: false });
    const side = new Headers(options?.headers).get("Authorization") === `Bearer ${"1".repeat(32)}` ? 0 : 1;
    if (path.endsWith("/join")) return Response.json({ role: side === 0 ? "host" : "guest" });
    if (path.endsWith("/signal")) {
      if (options?.method === "POST") descriptions[side] = JSON.parse(String(options.body));
      return Response.json({ description: descriptions[1 - side], candidates: [] });
    }
    if (path.endsWith("/candidates")) return Response.json({ ok: true });
    throw new Error(`Solicitud inesperada: ${path}`);
  };
  const errors: string[] = [];
  const host = new Peer("TEST", () => {}, text => errors.push(text));
  storage.delete("room:TEST");
  const guest = new Peer("TEST", () => {}, text => errors.push(text));
  try {
    await Promise.all([host.connect(), guest.connect()]);
    assert.equal(host.ready, false);
    assert.equal(guest.ready, false);
    assert.equal(errors.length, 2);
    assert.ok(errors.every(error => error.includes("conexión directa ni por TURN")));
    assert.ok(requests.every(path => !path.endsWith("/relay")));
  } finally {
    host.close(); guest.close(); globalThis.fetch = originalFetch; globalThis.RTCPeerConnection = originalRTC;
    if (originalStorage) Object.defineProperty(globalThis, "sessionStorage", originalStorage); else delete (globalThis as any).sessionStorage;
  }
});
