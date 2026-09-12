import { test } from "node:test";
import assert from "node:assert/strict";
import { RTCPeerConnection } from "werift";
import { Peer } from "../client/src/game/peer";
import { Simulation, emptyInput, type Snapshot } from "../client/src/game/simulation";

test("dos Peer reales abren ambos canales y juegan aunque se apague la señalización", { timeout: 30_000 }, async (t) => {
  const savedFetch = globalThis.fetch;
  const savedRtc = globalThis.RTCPeerConnection;
  const storage = new Map<string, string>();
  const hostToken = "1".repeat(32);
  storage.set("room:TEST", hostToken);
  let guestToken = "", offer: unknown = null, answer: unknown = null;
  const candidates: any[][] = [[], []];
  let signalingCalls = 0, signalingOff = false;
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { getItem: (k: string) => storage.get(k), setItem: (k: string, v: string) => storage.set(k, v) } });
  // Werift implementa WebRTC (ICE + DTLS + SCTP) con sockets reales, sin abrir una UI.
  globalThis.RTCPeerConnection = class extends RTCPeerConnection {
    constructor() { super({ iceServers: [], iceUseIpv6: false }); }
  } as any;
  globalThis.fetch = async (url, options) => {
    signalingCalls++;
    if (signalingOff) throw new Error("Alojamiento apagado durante la partida");
    if (String(url).endsWith("/ice")) return Response.json({ iceServers: [] });
    const auth = new Headers(options?.headers).get("Authorization")?.slice(7);
    const host = auth === hostToken;
    if (String(url).endsWith("/candidates")) {
      candidates[host ? 0 : 1] = JSON.parse(String(options?.body)).candidates;
      return Response.json({ ok: true });
    }
    if (String(url).endsWith("/join")) {
      if (!host && guestToken && guestToken !== auth) return Response.json({ message: "Sala llena" }, { status: 409 });
      if (!host) guestToken = auth!;
      return Response.json({ role: host ? "host" : "guest" });
    }
    if (options?.method === "POST") {
      const description = JSON.parse(String(options.body));
      // Obliga a negociar con los candidatos enviados aparte: no basta con que
      // Werift (a diferencia de un navegador) haya terminado de reunirlos antes.
      description.sdp = description.sdp.replace(/^a=(?:candidate:.*|end-of-candidates)\r?\n/gm, "");
      if (host) offer = description; else answer = description;
      return Response.json({ ok: true });
    }
    return Response.json({ description: host ? answer : offer, candidates: candidates[host ? 1 : 0] });
  };
  const errors: string[] = [];
  const host = new Peer("TEST", text => console.log("host:", text), error => { errors.push(error); console.log("host error:", error); });
  storage.delete("room:TEST");
  const guest = new Peer("TEST", text => console.log("guest:", text), error => { errors.push(error); console.log("guest error:", error); });
  t.after(() => { host.close(); guest.close(); });
  try {
    await Promise.all([host.connect(), guest.connect()]);
    assert.deepEqual(errors, []);
    assert.ok(host.ready && guest.ready);
    assert.ok(candidates.every(list => list.length > 0), "ambos enviaron candidatos por trickle ICE");
    assert.equal(host.fast?.ordered, false);
    assert.equal(host.fast?.maxRetransmits, 0);
    assert.equal(host.control?.ordered, true);
    signalingOff = true;
    const callsAtStart = signalingCalls;
    const received = new Promise<unknown>(resolve => { guest.onMessage = resolve; });
    host.send({ type: "state", score: [2, 1] });
    assert.deepEqual(await received, { type: "state", score: [2, 1] });
    const input = new Promise<unknown>(resolve => { host.onMessage = resolve; });
    guest.send({ type: "input", direction: 1 });
    assert.deepEqual(await input, { type: "input", direction: 1 });
    const pause = new Promise<unknown>(resolve => { host.onMessage = resolve; });
    guest.send({ type: "visibility", hidden: true }, true);
    assert.deepEqual(await pause, { type: "visibility", hidden: true });
    const hostSim = new Simulation(), guestSim = new Simulation();
    try {
      for (let match = 0; match < 2; match++) {
        hostSim.remainingTicks = 1;
        hostSim.score = [match + 1, 0];
        hostSim.step(emptyInput(), emptyInput());
        const ended = new Promise<void>(resolve => {
          guest.onMessage = message => { guestSim.restore(message.state as Snapshot); resolve(); };
        });
        host.send({ type: "state", state: hostSim.snapshot() }, true);
        await ended;
        assert.equal(guestSim.finished, true);
        assert.equal(guestSim.winner, 1);
        hostSim.requestRematch(1, match);
        const restarted = new Promise<void>(resolve => {
          host.onMessage = message => {
            if (message.type === "rematch" && hostSim.requestRematch(2, message.match as number)) {
              host.send({ type: "state", state: hostSim.snapshot() }, true);
            }
          };
          guest.onMessage = message => { guestSim.restore(message.state as Snapshot); resolve(); };
        });
        guest.send({ type: "rematch", match }, true);
        await restarted;
        assert.equal(guestSim.match, match + 1);
        assert.deepEqual(guestSim.score, [0, 0]);
        assert.deepEqual(guestSim.snapshot(), hostSim.snapshot());
      }
    } finally { hostSim.destroy(); guestSim.destroy(); }
    await new Promise(resolve => setTimeout(resolve, 2200));
    assert.ok(host.rtt > 0 && guest.rtt > 0);
    assert.equal(signalingCalls, callsAtStart);
    console.log(`WebRTC local, ida y vuelta: ${host.rtt.toFixed(1)} ms (no mide dos casas).`);
  } finally {
    host.close(); guest.close();
    globalThis.fetch = savedFetch;
    globalThis.RTCPeerConnection = savedRtc;
    delete (globalThis as any).sessionStorage;
  }
});
