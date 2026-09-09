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
    this.cursors = this.input.keyboard?.addKeys(" W, A, D, space") as Record<
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
      status.setText(state.players.size === 2 ? "A / D: moverse · W: saltar · Espacio: patear" : "Esperando al segundo jugador…");
    });
    this.room.onMessage("goal", () => this.sound.play("die"));
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

  update(_time: number, _delta: number) {
    if (!this.room || !this.ball) return;

    const { W, A, D, space } = this.cursors;
    // Enviar únicamente las acciones del jugador local.
    this.room.send("move", { direction: A.isDown ? "left" : D.isDown ? "right" : "stop" });
    if (Phaser.Input.Keyboard.JustDown(W)) this.room.send("move", { direction: "up" });
    if (Phaser.Input.Keyboard.JustDown(space)) this.room.send("kick");
    for (const player of Object.values(this.players)) this.interpolatePlayer(player);
    this.interpolateBall();
  }

  interpolatePlayer(player: Player) {
    const { serverX, serverY, serverVX, serverVY, serverKick } =
      player.body.data.values;

    if (!Number.isFinite(serverX) || !Number.isFinite(serverY)) return;
    if (serverKick && !player.boot.getData("wasKicking")) {
      this.events.emit(`kick-${player.team}`);
      player.boot.setData("lastKicked", this.time.now);
      player.boot.setVelocity(player.team === PlayerNumber.One ? 10 : -10, -5);
    }

    player.boot.setData("wasKicking", serverKick);
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
