import type { Data, Validated } from "@/core/validation/validation.utils";
import type { RoutineDto } from "./routine.schema";
import type { SendAgentMessageInteractor } from "@/ee/agent-chat/send-agent-message.interactor";
import type { AgentConversationOrigin, RoutineRunStatus as RoutineRunStatusType } from "@/generated/prisma";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { RoutineRunStatus } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";

import { composeRoutinePrompt } from "./routine-prompt";

export const ROUTINE_MAX_IN_FLIGHT_RUNS_PER_OWNER = 1;

const Schema = z.object({ routineRunId: z.uuid() });

export type StartRoutineRunData = Data<typeof Schema>;

export type StartRoutineRunOutcome = { started: boolean; reason?: string };

export abstract class StartRoutineRunRepo {
  abstract findRoutineRunForStartUnscoped(routineRunId: string): Promise<{
    id: string;
    companyId: string;
    status: RoutineRunStatusType;
    triggerEvent: string | null;
    triggerEntityId: string | null;
    routine: RoutineDto;
  } | null>;
  abstract countInFlightRoutineRunsForOwnerUnscoped(ownerUserId: string, excludeRunId: string): Promise<number>;
  abstract claimQueuedRoutineRunUnscoped(routineRunId: string, now: Date): Promise<boolean>;
  abstract countRecentRoutineRunsUnscoped(routineId: string, since: Date): Promise<number>;
  abstract markRoutineRunStartedUnscoped(args: {
    routineRunId: string;
    conversationId: string;
    turnRequestId: string;
    now: Date;
  }): Promise<void>;
  abstract settleRoutineRunUnscoped(args: {
    routineRunId: string;
    routineId: string;
    status: RoutineRunStatusType;
    error?: string | null;
    now: Date;
  }): Promise<void>;
}

export abstract class StartRoutineConversationRepo {
  abstract createAgentConversationForRun(args: {
    conversationId: string;
    title: string | null;
    modelKey?: string | null;
    now: Date;
    origin?: AgentConversationOrigin;
    creditCeiling?: number | null;
  }): Promise<void>;
}

@TenantInteractor()
export class StartRoutineRunInteractor extends AuthenticatedInteractor<StartRoutineRunData, StartRoutineRunOutcome> {
  constructor(
    private repo: StartRoutineRunRepo,
    private conversations: StartRoutineConversationRepo,
    private sendAgentMessage: SendAgentMessageInteractor,
  ) {
    super();
  }

  @Validate(Schema)
  async invoke(data: StartRoutineRunData): Validated<StartRoutineRunOutcome> {
    const now = new Date();
    const run = await this.repo.findRoutineRunForStartUnscoped(data.routineRunId);

    if (!run) return { ok: true as const, data: { started: false, reason: "runMissing" } };
    if (run.status !== RoutineRunStatus.queued)
      return { ok: true as const, data: { started: false, reason: "runNotQueued" } };

    const routine = run.routine;

    const blocked = await this.resolveBlockReason(routine, run.id, now);
    if (blocked) {
      await this.repo.settleRoutineRunUnscoped({
        routineRunId: run.id,
        routineId: routine.id,
        status: RoutineRunStatus.skipped,
        error: blocked,
        now,
      });

      return { ok: true as const, data: { started: false, reason: blocked } };
    }

    if (!(await this.repo.claimQueuedRoutineRunUnscoped(run.id, now)))
      return { ok: true as const, data: { started: false, reason: "runAlreadyClaimed" } };

    const conversationId = randomUUID();
    await this.conversations.createAgentConversationForRun({
      conversationId,
      title: routine.name,
      modelKey: routine.modelKey,
      now,
      origin: "routine",
      creditCeiling: routine.maxCreditsPerRun,
    });

    const sent = await this.sendAgentMessage.invoke({
      conversationId,
      clientRequestId: run.id,
      text: composeRoutinePrompt(routine.prompt, {
        routineName: routine.name,
        triggerEvent: run.triggerEvent,
        triggerEntityId: run.triggerEntityId,
      }),
      retry: false,
    });

    if (!sent.ok) {
      const message = sent.error.issues[0]?.message ?? "The routine could not start.";
      await this.repo.settleRoutineRunUnscoped({
        routineRunId: run.id,
        routineId: routine.id,
        status: RoutineRunStatus.blocked,
        error: message,
        now,
      });

      return { ok: true as const, data: { started: false, reason: message } };
    }

    if (sent.data.disposition !== "run") {
      await this.repo.settleRoutineRunUnscoped({
        routineRunId: run.id,
        routineId: routine.id,
        status: RoutineRunStatus.skipped,
        error: `agentDisposition:${sent.data.disposition}`,
        now,
      });

      return { ok: true as const, data: { started: false, reason: sent.data.disposition } };
    }

    await this.repo.markRoutineRunStartedUnscoped({
      routineRunId: run.id,
      conversationId: sent.data.conversationId,
      turnRequestId: sent.data.turnRequestId,
      now,
    });

    return { ok: true as const, data: { started: true } };
  }

  private async resolveBlockReason(routine: RoutineDto, runId: string, now: Date): Promise<string | null> {
    if (!routine.enabled) return "routineDisabled";

    const inFlight = await this.repo.countInFlightRoutineRunsForOwnerUnscoped(routine.ownerUserId, runId);
    if (inFlight >= ROUTINE_MAX_IN_FLIGHT_RUNS_PER_OWNER) return "ownerRunLimit";

    const recent = await this.repo.countRecentRoutineRunsUnscoped(routine.id, new Date(now.getTime() - 3_600_000));
    if (recent > routine.maxRunsPerHour) return "hourlyRunLimit";

    return null;
  }
}
