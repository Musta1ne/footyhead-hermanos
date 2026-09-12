import { Relay } from "./relay";
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
  private abort = new AbortController();
  private pingTimer?: ReturnType<typeof setInterval>;
  private lastHeard = performance.now();
  private auth: string;
  private relay?: Relay;
  private joined = false;
  private directFailed = false;
  onMessage: (message: Record<string, unknown>) => void = () => {};
  onReady: () => void = () => {};

  constructor(private pin: string, private status: (text: string) => void, private failed: (text: string) => void) {
    this.auth = sessionStorage.getItem(`room:${pin}`) || crypto.randomUUID().replaceAll("-", "");
    sessionStorage.setItem(`room:${pin}`, this.auth);
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
      this.host = (await this.api("join", "POST")).role === "host";
      this.joined = true;
      if (!globalThis.RTCPeerConnection) { this.startRelay(); return; }
      const configResponse = await fetch("/api/config", { signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(10_000)]) });
      if (!configResponse.ok) throw new Error("No se pudo preparar la conexión.");
      const config = await configResponse.json();
      if (this.closed) return;
      const pc = this.pc = new RTCPeerConnection({ iceServers: config.iceServers });
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
      while (!this.closed && !pc.remoteDescription) {
        const { description, relay } = await this.api("signal");
        if (relay || this.directFailed) { this.startRelay(); return; }
        if (description) {
          await pc.setRemoteDescription(description);
          if (!this.host) await this.publish(await pc.createAnswer());
          break;
        }
        if (performance.now() > deadline) throw new Error("La espera terminó. Creá otra sala para jugar.");
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      if (this.closed) return;
      this.status("Conectando directamente con tu hermano…");
      const connectionDeadline = performance.now() + 8_000;
      while (!this.ready && !this.closed && performance.now() < connectionDeadline) {
        const { relay } = await this.api("signal");
        if (this.ready) break;
        if (relay || this.directFailed) { this.startRelay(); return; }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      if (!this.ready && !this.closed) this.startRelay();
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
    // Enviar todos los candidatos juntos: evita depender del alojamiento durante el juego.
    const deadline = performance.now() + 15_000;
    while (pc.iceGatheringState !== "complete" && !this.closed) {
      if (performance.now() > deadline) throw new Error("La red no terminó de preparar la conexión. Intentá otra vez.");
      await new Promise(resolve => setTimeout(resolve, 100));
    }
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
    this.status("Conectando por servidor. Esperando a tu hermano…");
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
    if (!this.closed && channel?.readyState === "open" && channel.bufferedAmount < 64_000) {
      try { channel.send(JSON.stringify(message)); } catch { /* El cierre lo informa onclose. */ }
    }
  }
  private fail(message: string) { this.close(); this.failed(message); }
  close() {
    if (this.closed) return;
    this.closed = true; this.ready = false;
    this.abort.abort(); clearInterval(this.pingTimer);
    this.relay?.close();
    this.fast?.close(); this.control?.close(); this.pc?.close();
  }
}
