const SKEW_MESSAGES = ["was not found on the server", "Failed to find Server Action"];
const CHUNK_LOAD_MESSAGE = /^(Loading (CSS )?chunk \S+ failed|Failed to load chunk )/;

export function isDeploymentSkewError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === "UnrecognizedActionError" || name === "ChunkLoadError") return true;
  if (typeof message !== "string") return false;
  if (CHUNK_LOAD_MESSAGE.test(message)) return true;
  return message.includes("Server Action") && SKEW_MESSAGES.some((m) => message.includes(m));
}
