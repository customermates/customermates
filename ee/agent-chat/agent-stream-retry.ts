export function shouldRetryAgentStreamFailure(
  error: unknown,
  retries: number,
  limit: number,
  effects: { appliedRounds: number; completedTools: number; approvedCalls: number },
) {
  if (retries >= limit || effects.appliedRounds > 0 || effects.completedTools > 0 || effects.approvedCalls > 0)
    return false;
  const message = error instanceof Error ? error.message : "";
  return message.includes("doStreamStep") && message.includes("exceeded max retries (0 retries)");
}
