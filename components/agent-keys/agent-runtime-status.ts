import type { AgentRuntimeReason } from "./agent-labels";
import type { AgentRuntimeKind } from "@/features/automation-rules/automation-rule.schema";
import type { AgentRuntimeAvailability } from "@/features/automation-rules/agent-runtime-availability";

type RunnerLike = { online: boolean; revokedAt: string | null };

export type AgentRuntimeStatus =
  | { kind: "available" }
  | { kind: "keys"; count: number }
  | { kind: "online"; count: number }
  | { kind: "offline" }
  | { kind: "unavailable"; reason: AgentRuntimeReason | null };

export type AgentRuntimeStatusVariant = "success" | "warning" | "secondary";

type Context = { keyCount: number; runners: readonly RunnerLike[] };

export function agentRuntimeStatus(
  runtime: AgentRuntimeKind,
  availability: AgentRuntimeAvailability,
  { keyCount, runners }: Context,
): AgentRuntimeStatus {
  const option = availability[runtime];
  if (runtime === "ownKey" && option.available && keyCount > 0) return { kind: "keys", count: keyCount };
  if (runtime === "runner" && option.reason !== "selfHosted" && option.reason !== "plan") {
    const active = runners.filter((runner) => !runner.revokedAt);
    const online = active.filter((runner) => runner.online).length;
    if (online > 0) return { kind: "online", count: online };
    if (active.length > 0) return { kind: "offline" };
  }
  return option.available ? { kind: "available" } : { kind: "unavailable", reason: option.reason };
}

export function agentRuntimeStatusVariant(status: AgentRuntimeStatus): AgentRuntimeStatusVariant {
  switch (status.kind) {
    case "available":
    case "keys":
    case "online":
      return "success";
    case "offline":
      return "warning";
    case "unavailable":
      return "secondary";
  }
}

export function initialAgentRuntime(
  availability: AgentRuntimeAvailability,
  { keyCount, runners }: Context,
): AgentRuntimeKind {
  if (availability.mate.available) return "mate";
  if (availability.ownKey.available && keyCount > 0) return "ownKey";
  if (availability.runner.available || runners.some((runner) => !runner.revokedAt)) return "runner";
  if (keyCount > 0) return "ownKey";
  return "mate";
}
