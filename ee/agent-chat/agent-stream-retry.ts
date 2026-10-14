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

export function shouldResumeAgentStreamFailure(
  error: unknown,
  retries: number,
  limit: number,
  completedSteps: number,
  approvedCalls: number,
) {
  if (retries >= limit || completedSteps === 0 || approvedCalls > 0) return false;
  const message = error instanceof Error ? error.message : "";
  return message.includes("doStreamStep") && message.includes("exceeded max retries (0 retries)");
}
