import { Rooms } from "./rooms";
export type Env = { DB: D1Database; ASSETS: Fetcher; ICE_SERVERS_JSON?: string };
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const token = () => crypto.randomUUID().replaceAll("-", "");

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/") && url.pathname !== "/health") {
      const response = await env.ASSETS.fetch(request);
      if (response.status !== 404) return response;
      if (request.method === "GET" && (url.pathname === "/play" || /^\/play\/[A-Z0-9-]+$/i.test(url.pathname))) {
        // Pedir / evita que el alojamiento canonice index.html con una redirección
        // que borraría /play/CODIGO de la barra del navegador.
        return env.ASSETS.fetch(new Request(new URL("/", url), request));
      }
      return response;
    }
    try {
      if (url.pathname === "/health") return json({ ok: true, transport: "webrtc" });
      if (url.pathname === "/api/config" && request.method === "GET") {
        return json({ iceServers: env.ICE_SERVERS_JSON ? JSON.parse(env.ICE_SERVERS_JSON) : [
          { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] },
        ] });
      }
      // API del mismo origen; el código compartido es la invitación a una partida privada.
      if (request.headers.has("Origin") && request.headers.get("Origin") !== url.origin) return json({ message: "Origen no permitido." }, 403);
      const store = new Rooms(env.DB);
      if (url.pathname === "/api/rooms" && request.method === "POST") {
        const pin = token().slice(0, 10).toUpperCase();
        const hostToken = token();
        await store.create(pin, hostToken);
        return json({ pin, roomId: pin, hostToken }, 201);
      }
      const match = url.pathname.match(/^\/api\/rooms\/([A-Z0-9-]+)(?:\/(join|signal))?$/i);
      if (!match) return json({ message: "Ruta no encontrada." }, 404);
      const pin = match[1].replaceAll("-", "").toUpperCase();
      const room = await store.get(pin);
      if (!room) return json({ message: "Esta sala venció o no existe. Creá otra partida." }, 404);
      if (!match[2] && request.method === "GET") return json({ pin, roomId: pin });
      const auth = request.headers.get("Authorization")?.replace(/^Bearer /, "") || "";
      if (!/^[a-f0-9]{32}$/.test(auth)) return json({ message: "Falta la invitación de esta sala." }, 401);
      const host = auth === room.host;
      if (match[2] === "join" && request.method === "POST") {
        if (!host && !await store.claim(pin, auth)) return json({ message: "La sala ya tiene dos jugadores. Creá otra para jugar." }, 409);
        return json({ role: host ? "host" : "guest" });
      }
      if (!host && auth !== room.guest) return json({ message: "No pertenecés a esta sala." }, 403);
      if (match[2] === "signal" && request.method === "GET") {
        return json({ description: JSON.parse((host ? room.answer : room.offer) || "null") });
      }
      if (match[2] === "signal" && request.method === "POST") {
        if (Number(request.headers.get("content-length")) > 32000) return json({ message: "Mensaje demasiado grande." }, 413);
        const raw = await request.text();
        if (raw.length > 32000) return json({ message: "Mensaje demasiado grande." }, 413);
        const description = JSON.parse(raw);
        if (description.type !== (host ? "offer" : "answer") || typeof description.sdp !== "string") return json({ message: "Conexión inválida." }, 400);
        await store.signal(pin, host, JSON.stringify({ type: description.type, sdp: description.sdp }));
        return json({ ok: true });
      }
      return json({ message: "Operación no permitida." }, 405);
    } catch (error) {
      console.error("Signaling unavailable", error instanceof Error ? error.message : "unknown");
      return json({ message: "No se pudo preparar la conexión. Intentá crear otra sala." }, 503);
    }
  },
};
