import { test } from "node:test";
import assert from "node:assert/strict";
import { Peer } from "../client/src/game/peer";

const until = async (condition: () => boolean) => {
  const end = Date.now() + 6000;
  while (!condition()) {
    if (Date.now() > end) throw new Error("La conexión no avanzó");
    await new Promise(resolve => setTimeout(resolve, 20));
  }
};

test("WebRTC bloqueado: ambos usan HTTPS, reintentan sin duplicar controles y descartan estados viejos", { timeout: 15000 }, async () => {
  const originalFetch = globalThis.fetch, originalRTC = globalThis.RTCPeerConnection;
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const storage = new Map<string, string>([["room:TEST", "1".repeat(32)]]);
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { getItem: (k: string) => storage.get(k), setItem: (k: string, v: string) => storage.set(k, v) } });
  // Oferta/respuesta completas, pero ICE falla y ningún DataChannel llega a abrir.
  globalThis.RTCPeerConnection = class {
    iceGatheringState = "complete";
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
  const mail: any[] = [null, null];
  const descriptions: any[] = [null, null];
  let dropResponse = false, exchanges = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url) === "/api/config") return Response.json({ iceServers: [] });
    const side = new Headers(options?.headers).get("Authorization") === `Bearer ${"1".repeat(32)}` ? 0 : 1;
    if (String(url).endsWith("/join")) return Response.json({ role: side === 0 ? "host" : "guest" });
    if (String(url).endsWith("/signal")) {
      if (options?.method === "POST") descriptions[side] = JSON.parse(String(options.body));
      return Response.json({ description: descriptions[1 - side], relay: mail.some(Boolean) });
    }
    assert.ok(String(url).endsWith("/relay"));
    exchanges++;
    mail[side] = { ...JSON.parse(String(options?.body)), at: Date.now() };
    if (dropResponse && side === 1) { dropResponse = false; throw new Error("Respuesta perdida después de guardar"); }
    return Response.json({ peer: mail[1 - side], now: Date.now() });
  };
  const errors: string[] = [], received: any[] = [];
  const host = new Peer("TEST", () => {}, text => errors.push(text));
  storage.delete("room:TEST");
  const guest = new Peer("TEST", () => {}, text => errors.push(text));
  try {
    host.onMessage = message => received.push(message);
    await Promise.all([host.connect(), guest.connect()]);
    await until(() => host.ready && guest.ready);
    assert.equal(host.route, "por servidor"); assert.equal(guest.route, "por servidor");
    dropResponse = true;
    guest.send({ type: "visibility", hidden: true }, true);
    guest.send({ type: "rematch", match: 0 }, true);
    for (let seq = 1; seq <= 60; seq++) guest.send({ type: "input", seq });
    await until(() => received.some(m => m.type === "input" && m.seq === 60) && received.some(m => m.type === "rematch"));
    await until(() => host.rtt > 0 && guest.rtt > 0);
    assert.equal(received.filter(m => m.type === "visibility").length, 1);
    assert.equal(received.filter(m => m.type === "rematch").length, 1);
    assert.ok(!received.some(m => m.type === "input" && m.seq < 60));
    assert.deepEqual(errors, []);
    host.close(); guest.close();
    const stoppedAt = exchanges;
    await new Promise(resolve => setTimeout(resolve, 1200));
    assert.equal(exchanges, stoppedAt);
  } finally {
    host.close(); guest.close(); globalThis.fetch = originalFetch; globalThis.RTCPeerConnection = originalRTC;
    if (originalStorage) Object.defineProperty(globalThis, "sessionStorage", originalStorage); else delete (globalThis as any).sessionStorage;
  }
});
