import type { AgentTurnStatus, AgentTurnTerminalCode } from "@/generated/prisma";

import { RoutineRunStatus } from "@/generated/prisma";

export const ROUTINE_SUMMARY_MAX_CHARS = 280;

export function isTerminalTurnStatus(status: AgentTurnStatus): boolean {
  return status !== "running" && status !== "waitingBudget";
}

export function routineRunStatusFor(
  status: AgentTurnStatus,
  terminalCode: AgentTurnTerminalCode | null,
): RoutineRunStatus {
  if (!isTerminalTurnStatus(status)) return RoutineRunStatus.running;
  if (status === "failed" || status === "uncertain" || status === "needsAttention") return RoutineRunStatus.failed;
  if (terminalCode === "cancelled") return RoutineRunStatus.skipped;
  if (terminalCode === "completed") return RoutineRunStatus.succeeded;
  if (terminalCode === "partial" || terminalCode === "policyBreach") return RoutineRunStatus.partial;
  if (terminalCode === "error") return RoutineRunStatus.failed;

  return RoutineRunStatus.failed;
}

export function summarizeAssistantParts(parts: unknown): string | null {
  if (!Array.isArray(parts)) return null;

  const text = parts
    .flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const candidate = part as { type?: unknown; text?: unknown };
      return candidate.type === "text" && typeof candidate.text === "string" ? [candidate.text] : [];
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return null;

  return text.length > ROUTINE_SUMMARY_MAX_CHARS ? `${text.slice(0, ROUTINE_SUMMARY_MAX_CHARS - 1)}…` : text;
}
