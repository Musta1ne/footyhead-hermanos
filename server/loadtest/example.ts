import { Client } from "colyseus.js";
import { cli, Options } from "@colyseus/loadtest";

// Creá una sala en la web, sin entrar, y pasá ROOM_PIN al ejecutar loadtest.
export async function main(options: Options) {
  const pin = process.env.ROOM_PIN;
  if (!pin) throw new Error("Definí ROOM_PIN con el código de una sala vacía.");
  const endpoint = options.endpoint.replace(/^ws/, "http");
  const response = await fetch(endpoint + "/api/rooms/" + encodeURIComponent(pin));
  if (!response.ok) throw new Error("La sala no existe.");
  const { roomId } = await response.json() as { roomId: string };
  const room = await new Client(options.endpoint).joinById(roomId, { pin });
  room.onMessage("goal", () => {});
  room.onLeave(() => console.log("Partida cerrada"));
}
cli(main);
