import { Relay } from "./relay";
import { roomIdentity } from "./identity";
// Prefiere WebRTC; HTTPS permite jugar cuando la red bloquea los candidatos ICE.
export class Peer {
  pc?: RTCPeerConnection;
  fast?: RTCDataChannel;
  control?: RTCDataChannel;
  host = false;
  ready = false;
  closed = false;
  rtt = 0;
  route = "directa";
  turnAvailable = false;
  networkNote = "";
  private localCandidates: RTCIceCandidateInit[] = [];
  private sentCandidates = 0;
  private receivedCandidates = 0;
  private unlock?: () => void;
  private abort = new AbortController();
  private pingTimer?: ReturnType<typeof setInterval>;
  private lastHeard = performance.now();
  private auth: string;
  private identityError = "";
  private relay?: Relay;
  private joined = false;
  private directFailed = false;
  onMessage: (message: Record<string, unknown>) => void = () => {};
  onReady: () => void = () => {};

  constructor(private pin: string, private status: (text: string) => void, private failed: (text: string) => void) {
    this.auth = "";
    try { this.auth = roomIdentity(pin); }
    catch (error) { this.identityError = error instanceof Error ? error.message : "No se pudo guardar la sala."; }
  }

  private async api(path: string, method = "GET", body?: unknown) {
    const response = await fetch(`/api/rooms/${this.pin}/${path}`, {
      method, headers: { Authorization: `Bearer ${this.auth}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(10_000)]),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "No se pudo conectar la sala.");
    return result;
  }

  async connect() {
    try {
      if (this.identityError) throw new Error(this.identityError);
      // Evita que dos pestañas del creador sobrescriban la misma oferta.
      if (globalThis.navigator?.locks) {
        const acquired = await new Promise<boolean>((resolve, reject) => {
          void navigator.locks.request(`footyhead:${this.pin}`, { ifAvailable: true }, async lock => {
            if (!lock || this.closed) { resolve(false); return; }
            await new Promise<void>(release => { this.unlock = release; resolve(true); });
          }).catch(reject);
        });
        if (this.closed) return;
        if (!acquired) throw new Error("Ya tenés esta sala abierta en otra pestaña. Volvé a esa pestaña o cerrala antes de entrar acá.");
      }
      this.host = (await this.api("join", "POST")).role === "host";
      this.joined = true;
      if (!globalThis.RTCPeerConnection) { this.startRelay(); return; }
      const config = await this.api("ice");
      if (this.closed) return;
      this.turnAvailable = !!config.turnAvailable;
      this.networkNote = config.turnWarning || (this.turnAvailable ? "" : "TURN no está configurado.");
      const pc = this.pc = new RTCPeerConnection({ iceServers: config.iceServers, iceTransportPolicy: "all" });
      pc.onicecandidate = event => {
        if (event.candidate && this.localCandidates.length < 64) this.localCandidates.push(event.candidate.toJSON());
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          if (this.ready) this.fail("Se interrumpió la partida. Creá otra sala para reconectar.");
          else this.directFailed = true;
        }
        if (pc.connectionState === "disconnected") this.status("Se interrumpió la conexión. Esperando unos segundos…");
      };
      if (this.host) {
        this.attach(pc.createDataChannel("game", { ordered: false, maxRetransmits: 0 }));
        this.attach(pc.createDataChannel("control"));
        this.status("Preparando sala…");
        await this.publish(await pc.createOffer());
        this.status("Sos el jugador izquierdo. Esperando a tu hermano…");
      } else {
        pc.ondatachannel = event => this.attach(event.channel);
        this.status("Sos el jugador derecho. Esperando que el creador entre…");
      }
      const deadline = performance.now() + 10 * 60_000;
      let connectionDeadline = Infinity;
      while (!this.closed && !this.ready) {
        if (this.localCandidates.length > this.sentCandidates) {
          const candidates = [...this.localCandidates];
          await this.api("candidates", "POST", { candidates });
          this.sentCandidates = candidates.length;
        }
        const { description, relay, candidates = [] } = await this.api("signal");
        if (this.ready || this.closed) break;
        if (relay || this.directFailed) { this.startRelay(); return; }
        if (description && !pc.remoteDescription) {
          await pc.setRemoteDescription(description);
          if (!this.host) await this.publish(await pc.createAnswer());
          connectionDeadline = performance.now() + 20_000;
          this.status("Buscando la mejor conexión con tu hermano…");
        }
        if (pc.remoteDescription) {
          for (; this.receivedCandidates < candidates.length; this.receivedCandidates++) {
            await pc.addIceCandidate(candidates[this.receivedCandidates]);
          }
        }
        if (performance.now() > connectionDeadline) { this.startRelay(); return; }
        if (performance.now() > deadline) throw new Error("La espera terminó. Creá otra sala para jugar.");
        await new Promise(resolve => setTimeout(resolve, pc.remoteDescription ? 250 : 750));
      }
    } catch (error) {
      if (!this.closed && !this.ready) {
        if (this.joined) this.startRelay();
        else this.fail(error instanceof Error ? error.message : "No se pudo conectar.");
      }
    }
  }

  private async publish(description: RTCSessionDescriptionInit) {
    const pc = this.pc!;
    await pc.setLocalDescription(description);
    // Trickle ICE: una búsqueda STUN/TURN lenta no bloquea las rutas ya disponibles.
    if (!this.closed && pc.localDescription) await this.api("signal", "POST", { type: pc.localDescription.type, sdp: pc.localDescription.sdp });
  }

  private attach(channel: RTCDataChannel) {
    if (this.relay || this.closed) { channel.close(); return; }
    if (channel.label === "game") this.fast = channel;
    else if (channel.label === "control") this.control = channel;
    else { channel.close(); return; }
    channel.onopen = () => {
      if (this.ready || this.closed || this.fast?.readyState !== "open" || this.control?.readyState !== "open") return;
      this.markReady();
      void this.inspectRoute().catch(() => {});
    };
    channel.onclose = () => { if (!this.closed && !this.relay) { if (this.ready) this.fail("La partida se cerró. Volvé para crear otra."); else this.directFailed = true; } };
    channel.onmessage = event => {
      if (typeof event.data !== "string" || event.data.length > 16_000) return;
      try {
        const message = JSON.parse(event.data);
        if (!message || typeof message !== "object") return;
        this.receive(message);
      } catch { /* Un paquete inválido no debe detener la partida. */ }
    };
  }

  private startRelay() {
    if (this.closed || this.relay || this.ready) return;
    this.route = "por servidor";
    this.status("Conectando por respaldo HTTPS (más demora). Esperando a tu hermano…");
    this.relay = new Relay(packet => this.api("relay", "POST", packet), () => this.markReady(), message => this.receive(message), text => this.fail(text));
    if (this.pc) this.pc.onconnectionstatechange = null;
    this.fast?.close(); this.control?.close(); this.pc?.close();
    void this.relay.run();
  }

  private markReady() {
    if (this.ready || this.closed) return;
    this.ready = true;
    this.lastHeard = performance.now();
    this.onReady();
    this.pingTimer = setInterval(() => {
      if (performance.now() - this.lastHeard > 12_000) { this.fail("Tu hermano se desconectó. Creá una nueva partida."); return; }
      this.send({ type: "ping", at: performance.now() }, true);
      if (!this.relay) void this.inspectRoute().catch(() => {});
    }, 2000);
  }

  private receive(message: Record<string, unknown>) {
    this.lastHeard = performance.now();
    if (message.type === "ping" && typeof message.at === "number") this.send({ type: "pong", at: message.at }, true);
    else if (message.type === "pong" && typeof message.at === "number") this.rtt = Math.max(0, performance.now() - message.at);
    else this.onMessage(message);
  }

  private async inspectRoute() {
    const stats = await this.pc?.getStats();
    stats?.forEach(report => {
      if (report.type === "candidate-pair" && report.state === "succeeded" && report.nominated) {
        const local = stats.get(report.localCandidateId);
        const remote = stats.get(report.remoteCandidateId);
        this.route = local?.candidateType === "relay" || remote?.candidateType === "relay" ? "por TURN" : "directa";
      }
    });
  }

  send(message: unknown, reliable = false) {
    if (this.relay) { this.relay.send(message as Record<string, unknown>, reliable); return; }
    const channel = reliable ? this.control : this.fast;
    // No acumular estados viejos si la red se congestiona.
    if (!this.closed && channel?.readyState === "open" && (reliable ? channel.bufferedAmount < 64_000 : channel.bufferedAmount === 0)) {
      try { channel.send(JSON.stringify(message)); } catch { /* El cierre lo informa onclose. */ }
    }
  }
  private fail(message: string) { this.close(); this.failed(message); }
  close() {
    if (this.closed) return;
    this.closed = true; this.ready = false;
    this.abort.abort(); clearInterval(this.pingTimer);
    this.unlock?.(); this.unlock = undefined;
    this.relay?.close();
    this.fast?.close(); this.control?.close(); this.pc?.close();
  }
}
