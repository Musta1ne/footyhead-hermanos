import { roomRequest } from "../connection";
export async function action() { return roomRequest("", "POST"); }
