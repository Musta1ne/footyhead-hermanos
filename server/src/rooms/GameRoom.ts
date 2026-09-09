import { Room, Client } from "@colyseus/core";
import { GameState, Player } from "./schema/GameState";
import {
  Engine,
  Events,
  Bodies,
  Composite,
  World,
  Body,
  Sleeping,
  Collision,
} from "matter-js";
import { roomsByPin } from "./registry";

/**
 * Footyhead Game Room. First client that joins is designated host
 * and their sessionId is set to `hostId`
 */
export class GameRoom extends Room<GameState> {
  engine: Engine;
  world: World;
  hostId: string;
  playerOne: Body;
  playerTwo: Body;
  ball: Body;

  maxClients = 2;
  pin: string;
  paused = false;
  lastKick = new Map<string, number>();

  onCreate(options: any) {
    this.autoDispose = false; // Mantener el enlace mientras se comparte.
    this.pin = options.pin;
    this.clock.setTimeout(() => { if (this.clients.length === 0) this.disconnect(); }, 10 * 60_000);
    if (options.pin) {
      this.setPrivate();
    }

    this.setState(new GameState());

    this.engine = Engine.create({ enableSleeping: true, gravity: { y: 0.7 } });
    this.world = this.engine.world;

    const leftWall = Bodies.rectangle(-10, 300, 20, 768, { isStatic: true });
    const rightWall = Bodies.rectangle(1034, 300, 20, 768, { isStatic: true });
    const ceiling = Bodies.rectangle(400, -10, 1024, 20, { isStatic: true });
    const ground = Bodies.rectangle(512, 600, 1024, 20, {
      isStatic: true,
      friction: 0.3,
    });
    const goalOne = Bodies.rectangle(40, 465, 80, 5, {
      isStatic: true,
      angle: 0.05,
      restitution: 1,
    });
    const goalTwo = Bodies.rectangle(984, 465, 80, 5, {
      isStatic: true,
      angle: -0.05,
      restitution: 1,
    });
    this.playerOne = Bodies.circle(200, 500, 22, {
      mass: 20,
      restitution: 0.3,
    });
    this.playerTwo = Bodies.circle(824, 500, 22, {
      mass: 20,
      restitution: 0.3,
    });
    this.ball = Bodies.circle(512, 500, 10, {
      mass: 3,
      restitution: 1,
      friction: 0.05,
      frictionAir: 0.005,
    });

    Composite.add(this.world, [
      ground,
      leftWall,
      rightWall,
      ceiling,
      goalOne,
      goalTwo,
      this.ball,
    ]);

    this.setSimulationInterval((timeDelta) => {
      if (this.state.players.size === 2 && !this.paused) Engine.update(this.engine, Math.min(timeDelta, 1000 / 60));
    }, 1000 / 60);

    Events.on(this.engine, "afterUpdate", () => {
      const goalOneTop = Collision.collides(goalOne, this.ball);
      const goalTwoTop = Collision.collides(goalTwo, this.ball);

      if (goalOneTop?.collided) {
        Body.setVelocity(this.ball, { x: 4, y: -4 });
      } else if (goalTwoTop?.collided) {
        Body.setVelocity(this.ball, { x: -4, y: -4 });
      }

      // El servidor cuenta cada gol una sola vez para ambos navegadores.
      if (!this.paused && this.state.players.size === 2 && this.ball.position.y > 480) {
        if (this.ball.position.x < 65) this.scoreGoal(2);
        else if (this.ball.position.x > 959) this.scoreGoal(1);
      }
      this.state.ball.x = this.ball.position.x;
      this.state.ball.y = this.ball.position.y;
      this.state.ball.vx = this.ball.velocity.x;
      this.state.ball.vy = this.ball.velocity.y;
      this.state.ball.angle = this.ball.angularVelocity;

      this.state.players.forEach((playerState, sessionId) => {
        const player =
          sessionId == this.hostId ? this.playerOne : this.playerTwo;

        playerState.x = player.position.x;
        playerState.y = player.position.y;
        playerState.vx = player.velocity.x;
        playerState.vy = player.velocity.y;
      });
    });

    this.onMessage("move", (client, data) => {
      if (this.paused || this.state.players.size !== 2 || !data) return;
      const player = client.sessionId === this.hostId ? this.playerOne : this.playerTwo;
      Sleeping.set(player, false);
      if (data.direction === "left") Body.setVelocity(player, { x: -4, y: player.velocity.y });
      if (data.direction === "right") Body.setVelocity(player, { x: 4, y: player.velocity.y });
      if (data.direction === "stop") Body.setVelocity(player, { x: 0, y: player.velocity.y });
      // El suelo está en y=590 y el jugador tiene radio 22.
      if (data.direction === "up" && player.position.y >= 565 && Math.abs(player.velocity.y) < 1) {
        Body.setVelocity(player, { x: player.velocity.x, y: -6 });
      }
    });
    this.onMessage("kick", (client) => {
      if (this.paused || this.state.players.size !== 2) return;
      const now = this.clock.elapsedTime;
      if (now - (this.lastKick.get(client.sessionId) ?? -Infinity) < 300) return;
      this.lastKick.set(client.sessionId, now);
      const state = this.state.players.get(client.sessionId);
      if (!state) return;
      state.kick = true;
      this.clock.setTimeout(() => { state.kick = false; }, 200);
      const player = state.team === 1 ? this.playerOne : this.playerTwo;
      const dx = this.ball.position.x - player.position.x;
      const dy = this.ball.position.y - player.position.y;
      // Sólo una patada cercana puede afectar a la pelota.
      if (Math.hypot(dx, dy) <= 75) {
        Sleeping.set(this.ball, false);
        Body.setVelocity(this.ball, { x: state.team === 1 ? 7 : -7, y: -8 });
        Body.setAngularVelocity(this.ball, state.team === 1 ? 0.5 : -0.5);
      }
    });
  }

  onAuth(_client: Client, options: any) {
    return !!this.pin && options?.pin === this.pin;
  }

  onJoin(client: Client) {
    const team = this.state.players.size === 0 ? 1 : 2;
    if (team === 1) this.hostId = client.sessionId;
    World.add(this.world, team === 1 ? this.playerOne : this.playerTwo);
    const player = new Player(team);
    player.x = team === 1 ? 200 : 824;
    player.y = 550;
    this.state.players.set(client.sessionId, player);
    if (this.state.players.size === 2) {
      this.resetPositions();
      this.serveBall(1);
    }
  }

  onLeave(_client: Client) {
    // Una desconexión cierra la partida. Ambos pueden crear otra sin estado residual.
    this.disconnect();
  }

  onDispose() {
    roomsByPin.delete(this.pin);
    Events.off(this.engine, "afterUpdate", undefined);
    Composite.clear(this.world, false);
    Engine.clear(this.engine);
  }

  scoreGoal(team: 1 | 2) {
    if (this.paused) return;
    this.paused = true;
    this.state.score[team]++;
    this.broadcast("goal", team);
    this.clock.setTimeout(() => {
      this.resetPositions();
      this.serveBall(team);
      this.paused = false;
    }, 750);
  }

  resetPositions() {
    for (const [body, x, y] of [
      [this.playerOne, 200, 550], [this.playerTwo, 824, 550], [this.ball, 512, 400],
    ] as [Body, number, number][]) {
      Sleeping.set(body, false);
      Body.setPosition(body, { x, y });
      Body.setVelocity(body, { x: 0, y: 0 });
      Body.setAngularVelocity(body, 0);
    }
  }

  serveBall(from: 1 | 2) {
    Body.setVelocity(this.ball, { x: from === 1 ? 4 : -4, y: -3 });
  }
}
