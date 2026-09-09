import { randomInt } from "crypto";
import path from "path";
import express from "express";
import config from "@colyseus/tools";
import { matchMaker } from "colyseus";
import { GameRoom } from "./rooms/GameRoom";
import { roomsByPin } from "./rooms/registry";

export default config({
  initializeGameServer: (server) => { server.define("game_room", GameRoom); },
  initializeExpress: (app) => {
    app.get("/health", (_req, res) => res.json({ ok: true }));
    app.post("/api/rooms", async (_req, res) => {
      if (roomsByPin.size >= 100) {
        res.status(429).json({ message: "Hay demasiadas salas. Probá en unos minutos." });
        return;
      }
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let pin: string;
      do {
        pin = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("");
      } while (roomsByPin.has(pin));
      roomsByPin.set(pin, "");
      try {
        const room = await matchMaker.createRoom("game_room", { pin });
        roomsByPin.set(pin, room.roomId);
        res.status(201).json({ pin });
      } catch (error) {
        roomsByPin.delete(pin);
        console.error(error);
        res.status(500).json({ message: "No se pudo crear la sala." });
      }
    });
    app.get("/api/rooms/:pin", (req, res) => {
      const pin = req.params.pin.toUpperCase().replace(/-/g, "");
      const roomId = roomsByPin.get(pin);
      if (!roomId) {
        res.status(404).json({ message: "La sala no existe o caducó. Creá otra." });
        return;
      }
      res.json({ pin, roomId });
    });
    // Web y WebSocket en el mismo dominio: no hacen falta IPs ni CORS.
    const clientDist = path.resolve(__dirname, "../../client/dist");
    app.use(express.static(clientDist));
    app.get(["/", "/play", "/play/:pin"], (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  },
});
