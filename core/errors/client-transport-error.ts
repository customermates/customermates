const CLIENT_TRANSPORT_ERROR_MESSAGES = new Set([
  "Failed to fetch",
  "Load failed",
  "NetworkError when attempting to fetch resource.",
  "network error",
]);

const UNEXPECTED_ACTION_RESPONSE = "An unexpected response was received from the server.";

export function isClientTransportError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const { name, message } = error as { name?: unknown; message?: unknown };
  if (typeof message !== "string") return false;
  return (
    (name === "TypeError" && CLIENT_TRANSPORT_ERROR_MESSAGES.has(message)) || message === UNEXPECTED_ACTION_RESPONSE
  );
}
