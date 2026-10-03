import type { AgentTurnTerminalCode, RoutineRunStatus as RoutineRunStatusType } from "@/generated/prisma";
import type { AgentTurnStopReason } from "@/ee/agent-chat/agent-turn-request";

export abstract class ReconcileRoutineRunsRepo {
  abstract findRunningRoutineRunsUnscoped(
    limit: number,
    ownerUserId?: string,
  ): Promise<
    {
      id: string;
      routineId: string;
      executedByUserId: string;
      turnRequestId: string | null;
      conversationId: string | null;
    }[]
  >;
  abstract findOrphanedRunningRoutineRunsUnscoped(
    before: Date,
    limit: number,
  ): Promise<{ id: string; routineId: string; executedByUserId: string }[]>;
  abstract readTurnOutcomeUnscoped(turnRequestId: string): Promise<{
    status: RoutineRunStatusType;
    terminalCode: AgentTurnTerminalCode | null;
    stopReason: AgentTurnStopReason | null;
    settled: boolean;
    chargedMicrocents: number;
    summary: string | null;
  } | null>;
  abstract readRecentRoutineRunOutcomesUnscoped(
    routineId: string,
    executedByUserId: string,
    limit: number,
  ): Promise<RoutineRunStatusType[]>;
  abstract disableRoutineUnscoped(routineId: string, reason: string, executedByUserId: string): Promise<unknown>;
  abstract settleRoutineRunUnscoped(args: {
    routineRunId: string;
    routineId: string;
    expectedStatus: RoutineRunStatusType;
    status: RoutineRunStatusType;
    error?: string | null;
    summary?: string | null;
    chargedMicrocents?: number;
    terminalCode?: AgentTurnTerminalCode | null;
    expectedTurnRequestId?: string | null;
    now: Date;
  }): Promise<boolean>;
}
