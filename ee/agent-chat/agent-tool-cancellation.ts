export type AgentToolCancellation = {
  agentToolStatus: "cancelled";
  reason: "rejected" | "timeout";
  message: string;
};

export function isAgentToolCancellation(value: unknown): value is AgentToolCancellation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Partial<AgentToolCancellation>;
  return (
    result.agentToolStatus === "cancelled" &&
    (result.reason === "rejected" || result.reason === "timeout") &&
    typeof result.message === "string"
  );
}
