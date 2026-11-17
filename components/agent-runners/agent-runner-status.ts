import type { AgentRunnerDto } from "@/features/agent-runners/agent-runner.schema";

export type AgentRunnerStatus = "online" | "offline" | "neverSeen" | "revoked";

export type AgentRunnerBadgeVariant = "success" | "warning" | "secondary" | "destructive";

export function agentRunnerStatus(
  runner: Pick<AgentRunnerDto, "online" | "revokedAt" | "lastSeenAt">,
): AgentRunnerStatus {
  if (runner.revokedAt) return "revoked";
  if (runner.online) return "online";
  return runner.lastSeenAt ? "offline" : "neverSeen";
}

export const AGENT_RUNNER_BADGE_VARIANTS: Record<AgentRunnerStatus, AgentRunnerBadgeVariant> = {
  online: "success",
  offline: "warning",
  neverSeen: "secondary",
  revoked: "destructive",
};
