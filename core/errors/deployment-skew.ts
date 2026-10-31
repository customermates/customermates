const SKEW_MESSAGES = ["was not found on the server", "Failed to find Server Action"];

export function isDeploymentSkewError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === "UnrecognizedActionError") return true;
  return (
    typeof message === "string" && message.includes("Server Action") && SKEW_MESSAGES.some((m) => message.includes(m))
  );
}
