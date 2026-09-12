// La invitación nunca contiene la credencial del creador. Compartir una URL
// entre pestañas del mismo navegador sí debe conservar su lugar en la sala.
function read(storage: "localStorage" | "sessionStorage", key: string) {
  try { return globalThis[storage]?.getItem(key) || null; } catch { return null; }
}
export function rememberRoom(pin: string, token: string) {
  const key = `room:${pin}`;
  let stored = false;
  try { localStorage.setItem(key, JSON.stringify({ token, expires: Date.now() + 24 * 60 * 60_000 })); stored = true; } catch { /* Pestaña privada o almacenamiento bloqueado. */ }
  try { sessionStorage.setItem(key, token); stored = true; } catch { /* localStorage puede seguir disponible. */ }
  if (!stored) throw new Error("El navegador bloqueó el almacenamiento de la sala. Habilitalo para este sitio y creá otra sala.");
}
export function roomIdentity(pin: string) {
  const key = `room:${pin}`;
  let saved: string | null = null;
  try {
    const record = JSON.parse(read("localStorage", key) || "null");
    if (record?.expires > Date.now() && /^[a-f0-9]{32}$/.test(record.token)) saved = record.token;
  } catch { /* Ignorar un registro antiguo o dañado. */ }
  const token = saved || read("sessionStorage", key) || crypto.randomUUID().replaceAll("-", "");
  rememberRoom(pin, token);
  return token;
}
