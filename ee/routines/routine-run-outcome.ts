import type { AgentTurnStatus, AgentTurnTerminalCode } from "@/generated/prisma";
import type { AgentTurnStopReason } from "@/ee/agent-chat/agent-turn-request";

import { RoutineRunStatus } from "@/generated/prisma";

export const ROUTINE_SUMMARY_MAX_CHARS = 280;

export const ROUTINE_RUN_REASONS = [
  "adminPaused",
  "routineDisabled",
  "ownerPaused",
  "ownerUnavailable",
  "hourlyRunLimit",
  "filtersNotMatched",
  "startAbandoned",
  "ownerInactive",
  "startFailed",
  "agentAlreadyCompleted",
  "agentAlreadyRunning",
  "agentTurnFailed",
  "agentTurnUncertain",
  "agentTurnConflict",
] as const;

export const ROUTINE_RUN_ERROR_CODES = [
  "agentConversationNotFound",
  "agentModelUnavailable",
  "agentLimitReached",
  "agentTurnAlreadyRunning",
] as const;

export type RoutineRunReason = (typeof ROUTINE_RUN_REASONS)[number];
export type RoutineRunErrorCode = (typeof ROUTINE_RUN_ERROR_CODES)[number];

export function isRoutineRunErrorCode(value: string): value is RoutineRunErrorCode {
  return ROUTINE_RUN_ERROR_CODES.some((code) => code === value);
}

export function routineRunDetail(
  run: {
    status: RoutineRunStatus;
    summary: string | null;
    error: string | null;
  },
  t: (key: string) => string,
): string {
  if (run.summary) return run.summary;

  const reason = run.error;
  if (reason && (ROUTINE_RUN_REASONS as readonly string[]).includes(reason)) return t(`RoutineRunReason.${reason}`);
  if (reason && (ROUTINE_RUN_ERROR_CODES as readonly string[]).includes(reason)) return t(`Common.errors.${reason}`);
  if (reason || run.status === RoutineRunStatus.failed) return t("RoutineRunReason.unknownFailure");

  return "";
}

export function routineRunStopReason(
  run: { stopReason?: AgentTurnStopReason | null },
  t: (key: string) => string,
): string {
  switch (run.stopReason) {
    case "credit_limit":
      return t("RoutineRunStopReason.creditLimit");
    case "provider_error":
      return t("RoutineRunStopReason.providerError");
    case "content_filter":
      return t("RoutineRunStopReason.contentFilter");
    case "hosted_ai_unavailable":
      return t("RoutineRunStopReason.hostedAiUnavailable");
    case "cancelled":
      return t("RoutineRunStopReason.cancelled");
    case "turn_error":
      return t("RoutineRunStopReason.turnError");
    case "policy_breach":
      return t("RoutineRunStopReason.policyBreach");
    case null:
    case undefined:
      return "";
    default: {
      const exhaustive: never = run.stopReason;
      return exhaustive;
    }
  }
}

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
