import { LoaderFunctionArgs } from "react-router-dom";
import { roomRequest } from "../connection";
export async function loader({ params }: LoaderFunctionArgs) {
  return roomRequest(`/${encodeURIComponent(params.pin || "")}`);
}
