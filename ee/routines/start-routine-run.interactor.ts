import type { Data, Validated } from "@/core/validation/validation.utils";
import type { RoutineDto } from "./routine.schema";
import type { SendAgentMessageInteractor, SendAgentMessageResult } from "@/ee/agent-chat/send-agent-message.interactor";
import type { RoutineEventAccess } from "./routine-event-access";
import type { RoutineRunStatus as RoutineRunStatusType } from "@/generated/prisma";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { Action, Resource, RoutineRunStatus } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";

import { composeRoutinePrompt } from "./routine-prompt";
import { changedFieldsOf } from "./routine-event-filter";
import { isCustomField } from "@/core/utils/custom-field";
import { isRoutineRunErrorCode, type RoutineRunErrorCode, type RoutineRunReason } from "./routine-run-outcome";
import { DEFAULT_ROUTINE_MAX_CREDITS_PER_RUN, DEFAULT_ROUTINE_MAX_RUNS_PER_HOUR } from "./routine-run-limits";

const Schema = z.object({ routineRunId: z.uuid() });

type NonRunningAgentDisposition = Exclude<SendAgentMessageResult["disposition"], "run" | "atCapacity">;

const AGENT_DISPOSITION_REASONS = {
  completedReplay: "agentAlreadyCompleted",
  running: "agentAlreadyRunning",
  failed: "agentTurnFailed",
  uncertain: "agentTurnUncertain",
  conflict: "agentTurnConflict",
} as const satisfies Record<NonRunningAgentDisposition, RoutineRunReason>;

type StartRoutineRunReason =
  | RoutineRunReason
  | RoutineRunErrorCode
  | "runMissing"
  | "executorMismatch"
  | "runNotQueued"
  | "runAlreadyClaimed"
  | "triggerChanged"
  | "agentAtCapacity";

function customFieldIds(triggerPayload: unknown): string[] {
  return changedFieldsOf(triggerPayload).filter((field) => isCustomField(field));
}

function startFailureReason(error: z.ZodError): RoutineRunErrorCode | "startFailed" {
  for (const issue of error.issues) {
    const code = issue.code === "custom" ? issue.params?.error : undefined;
    if (typeof code === "string" && isRoutineRunErrorCode(code)) return code;
  }

  return "startFailed";
}

export type StartRoutineRunData = Data<typeof Schema>;

export type StartRoutineRunOutcome = { started: boolean; reason?: StartRoutineRunReason };

export abstract class StartRoutineRunRepo {
  abstract findRoutineRunForStartUnscoped(routineRunId: string): Promise<{
    id: string;
    companyId: string;
    executedByUserId: string;
    status: RoutineRunStatusType;
    triggerEvent: string | null;
    triggerEntityId: string | null;
    triggerPayload: unknown;
    routine: RoutineDto;
  } | null>;
  abstract claimQueuedRoutineRunForOwnerUnscoped(args: {
    routineRunId: string;
    executedByUserId: string;
    now: Date;
  }): Promise<{ routine: RoutineDto } | "runNotQueued" | "triggerChanged">;
  abstract countRecentRoutineRunsUnscoped(routineId: string, since: Date): Promise<number>;
  abstract findCustomColumnLabelsUnscoped(companyId: string, columnIds: string[]): Promise<Record<string, string>>;
  abstract settleRoutineRunUnscoped(args: {
    routineRunId: string;
    routineId: string;
    expectedStatus: RoutineRunStatusType;
    status: RoutineRunStatusType;
    error?: string | null;
    now: Date;
  }): Promise<boolean>;
}

export abstract class StartRoutineConversationRepo {
  abstract createAndLinkRoutineConversationForRun(args: {
    routineRunId: string;
    conversationId: string;
    title: string | null;
    now: Date;
    creditCeiling?: number | null;
  }): Promise<void>;
  abstract releaseUnstartedRoutineConversationForRetry(args: {
    routineRunId: string;
    conversationId: string;
  }): Promise<void>;
  abstract deleteUnusedAgentConversation(conversationId: string): Promise<void>;
}

@TenantInteractor({
  permissions: [
    { resource: Resource.routines, action: Action.readAll },
    { resource: Resource.routines, action: Action.readOwn },
  ],
  condition: "OR",
})
export class StartRoutineRunInteractor extends AuthenticatedInteractor<StartRoutineRunData, StartRoutineRunOutcome> {
  constructor(
    private repo: StartRoutineRunRepo,
    private conversations: StartRoutineConversationRepo,
    private sendAgentMessage: SendAgentMessageInteractor,
    private eventAccess: RoutineEventAccess,
  ) {
    super();
  }

  private async resolveChangedFieldLabels(companyId: string, triggerPayload: unknown): Promise<Record<string, string>> {
    const columnIds = customFieldIds(triggerPayload);

    return columnIds.length > 0 ? this.repo.findCustomColumnLabelsUnscoped(companyId, columnIds) : {};
  }

  @Validate(Schema)
  async invoke(data: StartRoutineRunData): Validated<StartRoutineRunOutcome> {
    const now = new Date();
    const run = await this.repo.findRoutineRunForStartUnscoped(data.routineRunId);

    if (!run) {
      return {
        ok: true as const,
        data: { started: false, reason: "runMissing" },
      };
    }
    if (run.companyId !== this.user.companyId || run.executedByUserId !== this.user.id) {
      return {
        ok: true as const,
        data: { started: false, reason: "executorMismatch" },
      };
    }
    if (run.status !== RoutineRunStatus.queued) {
      return {
        ok: true as const,
        data: { started: false, reason: "runNotQueued" },
      };
    }

    const claim = await this.repo.claimQueuedRoutineRunForOwnerUnscoped({
      routineRunId: run.id,
      executedByUserId: run.executedByUserId,
      now,
    });
    if (claim === "runNotQueued") {
      return {
        ok: true as const,
        data: { started: false, reason: "runAlreadyClaimed" },
      };
    }
    if (claim === "triggerChanged") {
      return {
        ok: true as const,
        data: { started: false, reason: "triggerChanged" },
      };
    }

    const routine = claim.routine;

    const blocked = await this.resolveBlockReason(routine, now);
    if (blocked) {
      await this.repo.settleRoutineRunUnscoped({
        routineRunId: run.id,
        routineId: routine.id,
        expectedStatus: RoutineRunStatus.running,
        status: RoutineRunStatus.skipped,
        error: blocked,
        now,
      });

      return { ok: true as const, data: { started: false, reason: blocked } };
    }

    if (!(await this.matchesTrigger(routine, run.triggerEvent, run.triggerEntityId, run.triggerPayload))) {
      await this.repo.settleRoutineRunUnscoped({
        routineRunId: run.id,
        routineId: routine.id,
        expectedStatus: RoutineRunStatus.running,
        status: RoutineRunStatus.skipped,
        error: "filtersNotMatched",
        now,
      });

      return {
        ok: true as const,
        data: { started: false, reason: "filtersNotMatched" },
      };
    }

    const conversationId = randomUUID();
    await this.conversations.createAndLinkRoutineConversationForRun({
      routineRunId: run.id,
      conversationId,
      title: routine.name,
      now,
      creditCeiling: DEFAULT_ROUTINE_MAX_CREDITS_PER_RUN,
    });

    let sent;
    try {
      sent = await this.sendAgentMessage.invokeRoutine({
        conversationId,
        clientRequestId: run.id,
        text: composeRoutinePrompt(routine.prompt, {
          routineName: routine.name,
          triggerEvent: run.triggerEvent,
          triggerEntityId: run.triggerEntityId,
          triggerPayload: run.triggerPayload,
          changedFieldLabels: await this.resolveChangedFieldLabels(run.companyId, run.triggerPayload),
        }),
        retry: false,
      });
    } catch (error) {
      await this.conversations.deleteUnusedAgentConversation(conversationId);
      throw error;
    }

    if (!sent.ok) {
      await this.conversations.deleteUnusedAgentConversation(conversationId);
      const reason = startFailureReason(sent.error);
      await this.repo.settleRoutineRunUnscoped({
        routineRunId: run.id,
        routineId: routine.id,
        expectedStatus: RoutineRunStatus.running,
        status: RoutineRunStatus.blocked,
        error: reason,
        now,
      });

      return { ok: true as const, data: { started: false, reason } };
    }

    if (sent.data.disposition === "atCapacity") {
      await this.conversations.releaseUnstartedRoutineConversationForRetry({
        routineRunId: run.id,
        conversationId,
      });
      return { ok: true as const, data: { started: false, reason: "agentAtCapacity" } };
    }

    if (sent.data.disposition !== "run") {
      const reason = AGENT_DISPOSITION_REASONS[sent.data.disposition];
      await this.repo.settleRoutineRunUnscoped({
        routineRunId: run.id,
        routineId: routine.id,
        expectedStatus: RoutineRunStatus.running,
        status: RoutineRunStatus.skipped,
        error: reason,
        now,
      });

      await this.conversations.deleteUnusedAgentConversation(conversationId);

      return { ok: true as const, data: { started: false, reason } };
    }

    return { ok: true as const, data: { started: true } };
  }

  private async matchesTrigger(
    routine: RoutineDto,
    triggerEvent: string | null,
    triggerEntityId: string | null,
    triggerPayload: unknown,
  ): Promise<boolean> {
    const filters = routine.triggerFilters;
    if (!triggerEvent) return true;

    return this.eventAccess.matchesCurrentUser({
      event: triggerEvent,
      entityId: triggerEntityId,
      triggerPayload,
      filters,
    });
  }

  private async resolveBlockReason(
    routine: RoutineDto,
    now: Date,
  ): Promise<Extract<RoutineRunReason, "routineDisabled" | "hourlyRunLimit"> | null> {
    if (!routine.enabled) return "routineDisabled";

    const recent = await this.repo.countRecentRoutineRunsUnscoped(routine.id, new Date(now.getTime() - 3_600_000));
    if (recent > DEFAULT_ROUTINE_MAX_RUNS_PER_HOUR) return "hourlyRunLimit";

    return null;
  }
}
