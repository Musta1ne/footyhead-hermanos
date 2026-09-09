import assert from "assert";
import { ColyseusTestServer, boot } from "@colyseus/testing";
import { Body } from "matter-js";
import appConfig from "../src/app.config";
import { GameRoom } from "../src/rooms/GameRoom";
import { roomsByPin } from "../src/rooms/registry";

describe("Partidas privadas para dos jugadores", () => {
  let server: ColyseusTestServer;
  before(async () => { server = await boot(appConfig); });
  after(async () => { await server.shutdown(); });
  beforeEach(async () => { await server.cleanup(); });
  async function pair() {
    const room = await server.createRoom("game_room", { pin: "ABC234" }) as GameRoom;
    const first = await server.connectTo(room, { pin: "ABC234" });
    const second = await server.connectTo(room, { pin: "ABC234" });
    first.onMessage("goal", () => {});
    second.onMessage("goal", () => {});
    await room.waitForNextPatch();
    return { room, first, second };
  }
  it("asigna equipos distintos y rechaza un tercer jugador", async () => {
    const { room, first, second } = await pair();
    assert.equal(first.state.players.get(first.sessionId).team, 1);
    assert.equal(second.state.players.get(second.sessionId).team, 2);
    await assert.rejects(server.connectTo(room, { pin: "ABC234" }));
  });
  it("rechaza un PIN incorrecto", async () => {
    const room = await server.createRoom("game_room", { pin: "ABC234" });
    await assert.rejects(server.connectTo(room, { pin: "WRONG1" }));
  });
  it("cuenta un único gol y lo sincroniza en ambos clientes", async () => {
    const { room, first, second } = await pair();
    Body.setPosition(room.ball, { x: 30, y: 530 });
    Body.setVelocity(room.ball, { x: 0, y: 0 });
    await room.waitForNextPatch();
    await room.waitForNextPatch();
    assert.equal(room.state.score[2], 1);
    assert.equal(first.state.score[2], 1);
    assert.equal(second.state.score[2], 1);
    room.scoreGoal(2);
    assert.equal(room.state.score[2], 1);
  });
  it("impide patear a distancia y mueve sólo al emisor", async () => {
    const { room, first } = await pair();
    room.paused = true;
    Body.setPosition(room.ball, { x: 512, y: 300 });
    Body.setVelocity(room.ball, { x: 0, y: 0 });
    room.paused = false;
    first.send("kick");
    await room.waitForNextMessage();
    assert.equal(room.ball.velocity.x, 0);
    first.send("move", { direction: "left" });
    await room.waitForNextMessage();
    assert.ok(room.playerOne.velocity.x < -3.5);
    assert.notEqual(room.playerTwo.velocity.x, -4);
  });
  it("crea y resuelve enlaces HTTP y los elimina al salir", async () => {
    const created = await server.http.post("/api/rooms");
    assert.equal(created.statusCode, 201);
    const pin = created.data.pin;
    const lookup = await server.http.get("/api/rooms/" + pin);
    const room = server.getRoomById(lookup.data.roomId);
    const client = await server.connectTo(room, { pin });
    await client.leave();
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(roomsByPin.has(pin), false);
  });
});
