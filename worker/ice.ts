export type IceEnv = { ICE_SERVERS_JSON?: string; TURN_KEY_ID?: string; TURN_KEY_API_TOKEN?: string };
type IceServer = { urls: string[]; username?: string; credential?: string };
const stun: IceServer = { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] };
function parseServers(value: unknown): IceServer[] {
  if (!Array.isArray(value)) throw new Error("ICE debe ser una lista");
  return value.map(server => {
    const urls = typeof server?.urls === "string" ? [server.urls] : server?.urls;
    if (!Array.isArray(urls) || !urls.length || !urls.every(url => typeof url === "string" && /^(stun|stuns|turn|turns):/.test(url))) throw new Error("URL ICE inválida");
    if (urls.some(url => /^turns?:/.test(url)) && (typeof server.username !== "string" || typeof server.credential !== "string")) throw new Error("Faltan credenciales TURN");
    return { urls, ...(typeof server.username === "string" ? { username: server.username } : {}), ...(typeof server.credential === "string" ? { credential: server.credential } : {}) };
  });
}
// Sólo se llama después de autenticar a un participante. La clave permanente
// queda en el Worker; el navegador recibe credenciales válidas por dos horas.
export async function iceConfig(env: IceEnv) {
  let iceServers: IceServer[] = [stun];
  let turnWarning = "";
  if (env.ICE_SERVERS_JSON) {
    try { iceServers.push(...parseServers(JSON.parse(env.ICE_SERVERS_JSON))); }
    catch { turnWarning = "La configuración TURN no es válida."; }
  }
  if (env.TURN_KEY_ID || env.TURN_KEY_API_TOKEN) {
    try {
      if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) throw new Error("Configuración incompleta");
      const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`, {
        method: "POST", headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ttl: 7200 }), signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) throw new Error("TURN no disponible");
      const data = await response.json() as { iceServers?: unknown };
      const generated = parseServers(data.iceServers);
      if (!generated.some(s => s.urls.some(url => /^turns?:/.test(url)))) throw new Error("Respuesta sin TURN");
      iceServers.push(...generated);
    } catch { turnWarning = "No se pudieron obtener credenciales TURN. Se intentará la conexión directa."; }
  }
  return { iceServers, turnAvailable: iceServers.some(s => s.urls.some(url => /^turns?:/.test(url))), turnWarning };
}
