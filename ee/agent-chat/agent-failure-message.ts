export function agentTurnFailureMessageKind(
  failureMessage: string | null | undefined,
  failedToolMessage: string | null,
): "contextLimit" | "streamInterrupted" | "turnError" {
  if (failedToolMessage) return "turnError";
  if (failureMessage?.includes("Agent context could not be compacted")) return "contextLimit";
  if (failureMessage?.includes("doStreamStep")) return "streamInterrupted";
  return "turnError";
}
