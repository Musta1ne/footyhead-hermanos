type Room = { pin: string; host: string; guest: string | null; offer: string | null; answer: string | null; host_ice: string | null; guest_ice: string | null; expires: number; relay: number; host_relay: string | null; guest_relay: string | null };
export class Rooms {
  constructor(private db: D1Database) {}
  async create(pin: string, host: string) {
    await this.db.batch([
      this.db.prepare("DELETE FROM rooms WHERE expires < ?").bind(Date.now()),
      this.db.prepare("INSERT INTO rooms (pin, host, expires) VALUES (?, ?, ?)").bind(pin, host, Date.now() + 15 * 60_000),
    ]);
  }
  get(pin: string) { return this.db.prepare("SELECT * FROM rooms WHERE pin = ? AND expires > ?").bind(pin, Date.now()).first<Room>(); }
  async claim(pin: string, guest: string) {
    const result = await this.db.prepare("UPDATE rooms SET guest = ? WHERE pin = ? AND (guest IS NULL OR guest = ?) AND expires > ?")
      .bind(guest, pin, guest, Date.now()).run();
    return result.meta.changes > 0;
  }
  async signal(pin: string, host: boolean, description: string) {
    // Los nombres de columna son constantes; todos los datos externos se enlazan.
    await this.db.prepare(host ? "UPDATE rooms SET offer = ? WHERE pin = ?" : "UPDATE rooms SET answer = ? WHERE pin = ?")
      .bind(description, pin).run();
  }
  async candidates(pin: string, host: boolean, candidates: string) {
    const column = host ? "host_ice" : "guest_ice";
    // Listas acumulativas: un reintento atrasado no borra candidatos nuevos.
    await this.db.prepare(`UPDATE rooms SET ${column} = ? WHERE pin = ? AND COALESCE(json_array_length(${column}), 0) < json_array_length(?)`)
      .bind(candidates, pin, candidates).run();
  }
  async relay(pin: string, auth: string, packet: string) {
    // Autenticar, guardar y leer al rival en un solo viaje a D1. Nunca cambiar
    // el buzón del otro rol ni reemplazar un paquete por un reintento anterior.
    return this.db.prepare(`UPDATE rooms SET relay = 1,
      host_relay = CASE WHEN host = ? AND COALESCE(json_extract(host_relay, '$.seq'), 0) < json_extract(?, '$.seq') THEN ? ELSE host_relay END,
      guest_relay = CASE WHEN guest = ? AND COALESCE(json_extract(guest_relay, '$.seq'), 0) < json_extract(?, '$.seq') THEN ? ELSE guest_relay END,
      expires = ? WHERE pin = ? AND expires > ? AND (host = ? OR guest = ?)
      RETURNING CASE WHEN host = ? THEN guest_relay ELSE host_relay END AS peer`)
      .bind(auth, packet, packet, auth, packet, packet, Date.now() + 15 * 60_000, pin, Date.now(), auth, auth, auth).first<{ peer: string | null }>();
  }
}
