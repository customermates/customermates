const AGENT_LIMIT_EXCEEDED_BRAND = Symbol.for("customermates.agentLimitExceeded");

export const AGENT_LIMIT_EXCEEDED_MESSAGE = "Your AI usage limit is reached.";

export function createAgentLimitExceededError() {
  const error = new Error(AGENT_LIMIT_EXCEEDED_MESSAGE);
  (error as unknown as Record<symbol, unknown>)[AGENT_LIMIT_EXCEEDED_BRAND] = true;
  return error;
}

export function isAgentLimitExceededError(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[AGENT_LIMIT_EXCEEDED_BRAND] === true
  );
}
