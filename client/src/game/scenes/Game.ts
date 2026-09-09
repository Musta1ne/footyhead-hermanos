import { serverUrl } from "../../connection";
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Scene } from "phaser";
import { Client as ColyseusClient, Room } from "colyseus.js";

import { CollisionCategories, PlayerNumber } from "../lib";
import { Ball, Goal, Player } from "../objects";

export class Game extends Scene {
  camera: Phaser.Cameras.Scene2D.Camera;
  cursors: Record<string, Phaser.Input.Keyboard.Key>;
  background: Phaser.GameObjects.Image;
  scoreText: Phaser.GameObjects.Text;
  platforms: Phaser.Physics.Matter.Image;
  players: Record<string, Player>;
  ball: Ball;
  room: Room;
  roomData: any;
  rtt = 150;
  lastDirection = "";
  lastMoveSent = -Infinity;
  predictUntil = 0;
  goalUntil = 0;
  lastLocalKick = -Infinity;
  client = new ColyseusClient(serverUrl);

  constructor() {
    super("Game");
    this.players = {};
  }

  async init(data: any) {
    this.roomData = data;
  }

  preload() {
    this.camera = this.cameras.main;
    this.cursors = this.input.keyboard?.addKeys("UP, LEFT, RIGHT, SPACE") as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;
  }

  async create(_time: number, _delta: number) {
    const { categoryFootball, categoryPlatform, categoryPlayer } =
      CollisionCategories;
    const shapes = this.cache.json.get("shapes");


    try {
      this.room = await this.client.joinById(this.roomData.roomId, {
        pin: this.roomData.pin,
      });
      console.log("Joined successfully!");
    } catch (e) {
      this.add.text(100, 300, "No se pudo entrar: sala llena o cerrada. Volvé a crear una.", { fontSize: "22px" });
      return;
    }

    this.events.once("shutdown", () => { this.room?.leave(); this.players = {}; });
    this.room.onLeave(() => {
      this.room = undefined as any;
      this.add.text(100, 270, "Partida cerrada. Volvé al inicio para crear otra.", { fontSize: "24px", backgroundColor: "#222222" }).setDepth(100);
    });
    const status = this.add.text(512, 100, "Esperando al segundo jugador…", { fontSize: "24px" }).setOrigin(0.5);
    this.room.onStateChange((state: any) => {
      status.setText(state.players.size === 2 ? "← / →: moverse · ↑: saltar · Espacio: patear" : "Esperando al segundo jugador…");
    });
    this.room.onMessage("goal", () => {
      this.goalUntil = this.time.now + 750;
      this.sound.play("die");
    });
    const pingText = this.add.text(512, 130, "Midiendo conexión…", { fontSize: "16px" }).setOrigin(0.5);
    this.room.onMessage("pong", (sentAt: number) => {
      this.rtt = performance.now() - sentAt;
      pingText.setText(`Conexión: ${Math.round(this.rtt)} ms`);
    });
    this.time.addEvent({ delay: 2000, loop: true, callback: () => this.room?.send("ping", performance.now()) });
    this.room.send("ping", performance.now());
    const release = () => {
      this.input.keyboard?.resetKeys();
      this.lastDirection = "stop";
      this.room?.send("move", { direction: "stop" });
    };
    this.game.events.on("blur", release);
    this.events.once("shutdown", () => this.game.events.off("blur", release));
    this.scoreText = this.add
      .text(512, 175, "0 : 0", {
        fontFamily: "Arial Black",
        fontSize: 64,
        stroke: "#000000",
        strokeThickness: 5,
      })
      .setOrigin(0.5);

    this.matter.world.setBounds();

    this.platforms = this.matter.add
      .image(512, 600, "ground", undefined, { label: "ground" })
      .setStatic(true)
      .setFriction(0.3)
      .setScale(1.3, 1)
      .setCollisionCategory(categoryPlatform)
      .setCollidesWith(categoryPlayer | categoryFootball);
    this.sound.add("ball-touch");
    this.sound.add("jump");
    this.sound.add("die");

    new Goal(this.matter.world, PlayerNumber.One, {
      shape: shapes.goal,
    });
    new Goal(this.matter.world, PlayerNumber.Two, {
      shape: shapes.goal_2,
    });

    this.room.state.players.onAdd((playerState: any, sessionId: string) => {
      console.log(`Player has been added with sessionId: ${sessionId}`);
      // Add player entity to world
      const player = new Player(
        this.matter.world,
        playerState.team,
        undefined,
        {
          shape: shapes[`boot_${playerState.team}`],
        }
      );
      this.players[sessionId] = player;
      player.boot.setData("lastKicked", -1);

      playerState.onChange(() => {
        // Cache updated coordinates for processing
        player.body.setData("serverX", playerState.x);
        player.body.setData("serverY", playerState.y);
        player.body.setData("serverVX", playerState.vx);
        player.body.setData("serverVY", playerState.vy);
        player.body.setData("serverKick", playerState.kick);
        player.body.setData("receivedAt", this.time.now);
      });

      player.body.setOnCollideWith([this.platforms], () => {
        player.isGrounded = true;
      });
    });
    this.room.state.players.onRemove((_: any, sessionId: string) => {
      const player = this.players[sessionId];
      if (player) {
        player.destroy();
        delete this.players[sessionId];
      }
    });

    this.ball = new Ball(this.matter.world, 512, 500);
    this.ball.setOnCollide(() => this.sound.play("ball-touch"));

    this.room.state.ball.onChange(() => {
      const ballState = this.room.state.ball;
      this.ball.setData("ballX", ballState.x);
      this.ball.setData("ballY", ballState.y);
      this.ball.setData("ballVX", ballState.vx);
      this.ball.setData("ballVY", ballState.vy);
      this.ball.setData("ballAngle", ballState.angle);
    });

    this.room.state.score.onChange(() => {
      const score = this.room.state.score;
      this.scoreText.setText(
        `${score[PlayerNumber.One]} : ${score[PlayerNumber.Two]}`
      );
    });

    this.sound.setMute(!!this.matter.config.debug);
  }

  update(_time: number, delta: number) {
    if (!this.room || !this.ball) return;
    const { UP, LEFT, RIGHT, SPACE } = this.cursors;
    const local = this.players[this.room.sessionId];
    const playing = this.room.state.players.size === 2 && this.time.now >= this.goalUntil;
    const direction = playing ? (LEFT.isDown ? "left" : RIGHT.isDown ? "right" : "stop") : "stop";
    if (direction !== this.lastDirection) this.predictUntil = this.time.now + Math.min(this.rtt + 80, 1000);
    // Cambio inmediato y un latido de seguridad; no enviar 60 órdenes idénticas/segundo.
    if (direction !== this.lastDirection || this.time.now - this.lastMoveSent >= 200) {
      this.room.send("move", { direction });
      this.lastDirection = direction;
      this.lastMoveSent = this.time.now;
    }
    const jump = Phaser.Input.Keyboard.JustDown(UP);
    const kick = Phaser.Input.Keyboard.JustDown(SPACE);
    if (playing && local) {
      // Respuesta local en este fotograma, sin esperar al servidor.
      local.body.setVelocityX(direction === "left" ? -4 : direction === "right" ? 4 : 0);
      if (jump) {
        this.room.send("move", { direction: "up" });
        if (local.body.y >= 560 && Math.abs(local.body.getVelocity().y) < 1) {
          local.body.setVelocityY(-6);
          this.predictUntil = this.time.now + Math.min(this.rtt + 80, 1000);
        }
      }
      if (kick && this.time.now - this.lastLocalKick >= 300) {
        this.lastLocalKick = this.time.now;
        this.room.send("kick");
        this.animateKick(local);
      }
    }
    for (const [id, player] of Object.entries(this.players)) {
      this.interpolatePlayer(player, id === this.room.sessionId && playing, delta);
    }
    this.interpolateBall();
  }

  animateKick(player: Player) {
    this.events.emit(`kick-${player.team}`);
    player.boot.setVelocity(player.team === PlayerNumber.One ? 10 : -10, -5);
  }

  interpolatePlayer(player: Player, local: boolean, delta: number) {
    const { serverX, serverY, serverVX, serverVY, serverKick } =
      player.body.data.values;

    if (!Number.isFinite(serverX) || !Number.isFinite(serverY)) return;
    if (serverKick && !player.boot.getData("wasKicking") && (!local || this.time.now - this.lastLocalKick > 600)) {
      this.events.emit(`kick-${player.team}`);
      player.boot.setData("lastKicked", this.time.now);
      player.boot.setVelocity(player.team === PlayerNumber.One ? 10 : -10, -5);
    }

    player.boot.setData("wasKicking", serverKick);
    if (local) {
      if (this.time.now < this.predictUntil) return;
      // Extrapolación acotada; conservar la velocidad local y corregir sólo el error.
      const age = Math.min(150, this.rtt / 2 + this.time.now - (player.body.getData("receivedAt") || this.time.now));
      const targetX = Phaser.Math.Clamp(serverX + serverVX * age / (1000 / 60), 22, 1002);
      const errorX = targetX - player.body.x;
      const errorY = serverY - player.body.y;
      const blend = 1 - Math.exp(-Math.min(delta, 50) / 120);
      player.body.setPosition(
        Math.abs(errorX) > 180 ? targetX : player.body.x + errorX * blend,
        Math.abs(errorY) > 180 ? serverY : player.body.y + errorY * blend
      );
      return;
    }
    player.body.setPosition(
      Phaser.Math.Linear(player.body.x, serverX, 0.2),
      Phaser.Math.Linear(player.body.y, serverY, 0.2)
    );
    player.body.setVelocity(
      Phaser.Math.Linear(player.body.getVelocity().x, serverVX, 0.2),
      Phaser.Math.Linear(player.body.getVelocity().y, serverVY, 0.2)
    );
  }

  interpolateBall() {
    if (!this.ball.data) return;

    const { ballX, ballY, ballVX, ballVY, ballAngle } = this.ball.data.values;
    if (!Number.isFinite(ballX) || !Number.isFinite(ballY)) return;
    this.ball.setPosition(
      Phaser.Math.Linear(this.ball.x, ballX, 0.1),
      Phaser.Math.Linear(this.ball.y, ballY, 0.2)
    );
    this.ball.setVelocity(
      Phaser.Math.Linear(this.ball.getVelocity().x, ballVX, 0.5),
      Phaser.Math.Linear(this.ball.getVelocity().y, ballVY, 0.5)
    );
    this.ball.setAngularVelocity(
      Phaser.Math.Linear(this.ball.getAngularVelocity(), ballAngle, 0.1)
    );
  }

}
