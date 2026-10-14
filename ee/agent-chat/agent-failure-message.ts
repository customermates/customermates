export function agentTurnFailureMessageKind(
  failureMessage: string | null | undefined,
): "contextLimit" | "streamInterrupted" | "turnError" {
  if (failureMessage?.includes("Agent context could not be compacted")) return "contextLimit";
  if (failureMessage?.includes("doStreamStep")) return "streamInterrupted";
  return "turnError";
}

export function terminalAgentToolFailureMessage(
  failureMessage: string | null | undefined,
  failedToolMessage: string | null,
): string | null {
  return failureMessage === failedToolMessage ? failedToolMessage : null;
}
