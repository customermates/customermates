import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { AgentUsageService } from "@/ee/agent-chat/agent-usage.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, RoutineTriggerKind, Status } from "@/generated/prisma";
import { env } from "@/env";

import { CustomErrorCode } from "@/core/validation/validation.types";
import {
  failAuthorization,
  failConflict,
  failRateLimit,
  failUnavailable,
} from "@/core/validation/interactor-failure-server";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Write } from "@/core/decorators/write.decorator";
import type { RunRoutineNowRepo } from "./run-routine-now.repo";

export const RunRoutineNowSchema = z.object({ id: z.uuid() });

export type RunRoutineNowData = Data<typeof RunRoutineNowSchema>;

@TenantInteractor({ resource: Resource.routines, manage: "update" })
export class RunRoutineNowInteractor extends AuthenticatedInteractor<RunRoutineNowData, string> {
  constructor(
    private repo: RunRoutineNowRepo,
    private backgroundTaskService: BackgroundTaskService,
    private usageService: AgentUsageService,
  ) {
    super();
  }

  @Write({ input: RunRoutineNowSchema, output: z.string() })
  async invoke(data: RunRoutineNowData): Validated<string> {
    const routine = await this.repo.getRoutineByIdOrThrow(data.id);
    if (routine.ownerUserId !== this.user.id) return failAuthorization(CustomErrorCode.routineRunNotOwner);
    if (routine.triggerKind !== RoutineTriggerKind.schedule)
      return failConflict(CustomErrorCode.routineRunNowRequiresSchedule, ["id"]);
    if (!routine.enabled) return failConflict(CustomErrorCode.routineTestRequiresEnabled, ["id"]);
    if (routine.owner?.status !== Status.active) return failConflict(CustomErrorCode.routineOwnerIneligible, ["id"]);
    if (env.HOSTED_AI_OPERATOR_CONTROLS_ENABLED && env.HOSTED_AI_PROVIDER_WORK_PAUSED)
      return failUnavailable(CustomErrorCode.routineAiWorkPaused, ["id"]);

    const usage = await this.usageService.getUsageSummary(this.user.id);
    if (usage.blockedReason === "credits_exhausted") return failRateLimit(CustomErrorCode.agentLimitReached, ["id"]);
    if (usage.blockedReason) return failUnavailable(CustomErrorCode.agentServiceUnavailable, ["id"]);

    const run = await this.repo.createManualRoutineRunOrThrow(routine.id, this.user.id, new Date());

    await this.backgroundTaskService.dispatch("run-routine", {
      routineRunId: run.id,
      companyId: run.companyId,
      ownerUserId: run.executedByUserId,
    });

    return { ok: true as const, data: run.id };
  }
}
