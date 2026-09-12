type Message = Record<string, unknown>;
type Control = { id: number; message: Message };
type Packet = { seq: number; ack: number; controls: Control[]; fast: Message | null; at: number };

// Un intercambio a la vez: descarta estados viejos, reintenta controles hasta su acuse.
export class Relay {
  private stopped = false;
  private controls: Control[] = [];
  private fast: Message | null = null;
  private nextControl = 0;
  private received = 0;
  private remoteSeq = 0;
  private seq = 0;
  private ready = false;
  constructor(private exchange: (packet: unknown) => Promise<{ peer: Packet | null; now: number }>,
    private onReady: () => void, private onMessage: (message: Message) => void, private failed: (message: string) => void) {}

  send(message: Message, reliable: boolean) {
    if (this.stopped) return;
    if (reliable) {
      if (this.controls.length >= 64) { this.failed("La conexión está demasiado lenta. Creá otra sala."); this.close(); return; }
      this.controls.push({ id: ++this.nextControl, message });
    } else this.fast = message;
  }

  async run() {
    const deadline = performance.now() + 10 * 60_000;
    let lastSuccess = performance.now(), lastPeer = performance.now();
    while (!this.stopped) {
      const start = performance.now();
      try {
        const { peer, now } = await this.exchange({ seq: ++this.seq, ack: this.received, controls: [...this.controls], fast: this.fast });
        if (this.stopped) return;
        lastSuccess = performance.now();
        if (peer && now - peer.at < 12_000) {
          lastPeer = performance.now();
          this.controls = this.controls.filter(c => c.id > peer.ack);
          if (!this.ready) { this.ready = true; this.onReady(); }
          if (peer.seq > this.remoteSeq) {
            this.remoteSeq = peer.seq;
            for (const control of peer.controls) {
              if (control.id <= this.received) continue;
              if (control.id !== this.received + 1) throw new Error("Se perdió un mensaje de la partida. Creá otra sala.");
              this.received = control.id;
              this.onMessage(control.message);
            }
            if (peer.fast) this.onMessage(peer.fast);
          }
        }
      } catch (error) {
        if (this.stopped) return;
        if (performance.now() - lastSuccess > 12_000) {
          this.failed(error instanceof Error ? error.message : "Se interrumpió la conexión con el juego."); this.close(); return;
        }
      }
      if ((this.ready && performance.now() - lastPeer > 12_000) || (!this.ready && performance.now() > deadline)) {
        this.failed("El otro jugador no está conectado. Creá una nueva partida."); this.close(); return;
      }
      await new Promise(resolve => setTimeout(resolve, Math.max(0, (this.ready ? 100 : 1000) - (performance.now() - start))));
    }
  }
  close() { this.stopped = true; this.controls = []; this.fast = null; }
}
