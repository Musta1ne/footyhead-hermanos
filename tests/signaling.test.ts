import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import worker from "../worker/index";

test("un enlace directo de sala conserva su URL y no redirige al inicio", async () => {
  const assets = {
    async fetch(request: Request) {
      const path = new URL(request.url).pathname;
      if (path === "/index.html") return Response.redirect("https://game.test/", 307);
      return new Response(path === "/" ? "<html>Juego</html>" : "Not found", { status: path === "/" ? 200 : 404 });
    },
  };
  for (const path of ["/play", "/play/ABC123"]) {
    const response = await worker.fetch(new Request(`https://game.test${path}`), { ASSETS: assets as any, DB: {} as any });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("location"), null);
    assert.match(await response.text(), /Juego/);
  }
});

test("sala real en SQLite: roles, tercero rechazado, señal privada y vencimiento", async () => {
  const sql = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle").filter(name => name.endsWith(".sql"))) sql.exec(readFileSync(`drizzle/${file}`, "utf8"));
  const db = {
    prepare(query: string) {
      const prepared = sql.prepare(query);
      return { bind(...args: any[]) { return {
        async first() { return prepared.get(...args) || null; },
        async run() { const result = prepared.run(...args); return { meta: { changes: Number(result.changes) } }; },
      }; } };
    },
    async batch(statements: any[]) { return Promise.all(statements.map(statement => statement.run())); },
  };
  const request = (path: string, method = "GET", token?: string, body?: unknown) => worker.fetch(new Request(`https://game.test${path}`, {
    method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined,
  }), { DB: db as any, ASSETS: { fetch: async () => new Response("asset") } as any });
  const created = await request("/api/rooms", "POST");
  assert.equal(created.status, 201);
  const { pin, hostToken } = await created.json() as any;
  const guest = crypto.randomUUID().replaceAll("-", "");
  assert.equal((await (await request(`/api/rooms/${pin}/join`, "POST", hostToken)).json() as any).role, "host");
  assert.equal((await (await request(`/api/rooms/${pin}/join`, "POST", guest)).json() as any).role, "guest");
  assert.equal((await request(`/api/rooms/${pin}/join`, "POST", "a".repeat(32))).status, 409);
  assert.equal((await request(`/api/rooms/${pin}/signal`)).status, 401);
  assert.equal((await request(`/api/rooms/${pin}/signal`, "GET", "a".repeat(32))).status, 403);
  const offer = { type: "offer", sdp: "v=0\r\n" };
  assert.equal((await request(`/api/rooms/${pin}/signal`, "POST", hostToken, offer)).status, 200);
  assert.deepEqual((await (await request(`/api/rooms/${pin}/signal`, "GET", guest)).json() as any).description, offer);
  assert.equal((await request(`/api/rooms/${pin}/signal`, "POST", guest, offer)).status, 400);
  const publicRoom = await (await request(`/api/rooms/${pin}`)).json() as any;
  assert.equal(publicRoom.host, undefined); assert.equal(publicRoom.hostToken, undefined);
  sql.prepare("UPDATE rooms SET expires = 0 WHERE pin = ?").run(pin);
  assert.equal((await request(`/api/rooms/${pin}`)).status, 404);
  sql.close();
});
