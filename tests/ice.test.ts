import { test } from "node:test";
import assert from "node:assert/strict";
import { iceConfig } from "../worker/ice";

test("TURN temporal mantiene STUN, usa el secreto sólo en servidor y tolera caídas", async () => {
  const original = globalThis.fetch;
  const env = { TURN_KEY_ID: "test-key", TURN_KEY_API_TOKEN: "server-secret" };
  try {
    let requests = 0;
    globalThis.fetch = async (url, options) => {
      requests++;
      assert.equal(String(url), "https://rtc.live.cloudflare.com/v1/turn/keys/test-key/credentials/generate-ice-servers");
      assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer server-secret");
      assert.deepEqual(JSON.parse(String(options?.body)), { ttl: 7200 });
      return Response.json({ iceServers: [{ urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"], username: "temporary-user", credential: "temporary-password" }] });
    };
    const configured = await iceConfig(env);
    assert.equal(configured.turnAvailable, true);
    assert.equal(configured.turnWarning, "");
    assert.ok(configured.iceServers[0].urls.some(url => url.startsWith("stun:")));
    assert.ok(!JSON.stringify(configured).includes("server-secret"));
    assert.equal(requests, 1);
    globalThis.fetch = async () => new Response("Unauthorized", { status: 401 });
    const failed = await iceConfig(env);
    assert.equal(failed.turnAvailable, false);
    assert.match(failed.turnWarning, /credenciales/);
    assert.ok(failed.iceServers.length);
    const malformed = await iceConfig({ ICE_SERVERS_JSON: "bad json" });
    assert.equal(malformed.turnAvailable, false);
    assert.match(malformed.turnWarning, /no es válida/);
    const ownTurn = await iceConfig({ ICE_SERVERS_JSON: JSON.stringify([{ urls: "turn:example.com:3478", username: "user", credential: "temporary" }]) });
    assert.equal(ownTurn.turnAvailable, true);
    assert.ok(ownTurn.iceServers[0].urls[0].startsWith("stun:"));
  } finally { globalThis.fetch = original; }
});
