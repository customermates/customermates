import type { AgentRuntimeAvailability } from "@/features/automation-rules/agent-runtime-availability";

export function agentRuntimeWithKeys(
  availability: AgentRuntimeAvailability,
  keyCount: number,
): AgentRuntimeAvailability {
  if (availability.ownKey.reason === "plan") return availability;
  return {
    ...availability,
    ownKey:
      keyCount > 0
        ? { ...availability.ownKey, available: true, reason: null }
        : { ...availability.ownKey, available: false, reason: "noKey" },
  };
}
