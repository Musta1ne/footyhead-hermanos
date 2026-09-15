import { roomRequest } from "../connection";
import { isMatchMode } from "../game/match-mode";
export async function action({ request }: { request: Request }) {
  const mode = (await request.formData()).get("mode");
  if (!isMatchMode(mode)) throw new Error("Elegí un modo de juego válido.");
  return roomRequest("", "POST", { mode });
}
