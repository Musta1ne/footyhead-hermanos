export const serverUrl = window.location.origin;
export async function roomRequest(path: string, method = "GET") {
  let response: Response;
  try {
    response = await fetch(`/api/rooms${path}`, { method });
  } catch {
    throw new Error("No se pudo conectar con el servidor. Revisá tu conexión.");
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "No se pudo abrir la sala.");
  }
  return response.json();
}
