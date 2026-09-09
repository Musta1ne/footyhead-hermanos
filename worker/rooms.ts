type Room = { pin: string; host: string; guest: string | null; offer: string | null; answer: string | null; expires: number };
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
}
