import type { RoutineDto, UpsertRoutineData } from "./routine.schema";
import type { Validated } from "@/core/validation/validation.utils";
import type { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import { Action, Resource, RoutineTriggerKind } from "@/generated/prisma";

import { RoutineDtoSchema, UpsertRoutineSchema, validateRoutineFinalState } from "./routine.schema";

import { getEntitlements } from "@/ee/subscription/entitlements";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { failAuthorization, failConflict } from "@/core/validation/interactor-failure-server";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { runPrecheck } from "@/core/validation/run-precheck";
import { RoutineLimitExceededError, type RoutineCountLimit } from "./routine-run-limits";

function mergeRoutineFinalState(previous: RoutineDto, update: UpsertRoutineData): UpsertRoutineData {
  const triggerKind = update.triggerKind ?? previous.triggerKind;
  const switchingToSchedule =
    previous.triggerKind !== RoutineTriggerKind.schedule && triggerKind === RoutineTriggerKind.schedule;
  const scheduled = triggerKind === RoutineTriggerKind.schedule;

  return {
    name: update.name ?? previous.name,
    prompt: update.prompt ?? previous.prompt,
    modelKey: update.modelKey === undefined ? previous.modelKey : update.modelKey,
    enabled: update.enabled ?? previous.enabled,
    triggerKind,
    cronExpression: scheduled
      ? update.cronExpression === undefined
        ? switchingToSchedule
          ? null
          : previous.cronExpression
        : update.cronExpression
      : null,
    timezone: scheduled
      ? update.timezone === undefined
        ? switchingToSchedule
          ? null
          : previous.timezone
        : update.timezone
      : null,
    runOnceAt: scheduled
      ? update.runOnceAt === undefined
        ? switchingToSchedule
          ? null
          : previous.runOnceAt
        : update.runOnceAt
      : null,
    triggerEvents: update.triggerEvents ?? previous.triggerEvents,
    changedFields: update.changedFields ?? previous.changedFields,
    triggerFilters: update.triggerFilters === undefined ? previous.triggerFilters : update.triggerFilters,
    debounceSeconds: update.debounceSeconds ?? previous.debounceSeconds,
    maxRunsPerHour: update.maxRunsPerHour ?? previous.maxRunsPerHour,
    maxCreditsPerRun: update.maxCreditsPerRun ?? previous.maxCreditsPerRun,
  };
}

export abstract class UpsertRoutineRepo {
  abstract upsertRoutineOrThrow(args: UpsertRoutineData, routineLimit?: RoutineCountLimit): Promise<RoutineDto>;
  abstract getRoutineByIdOrThrow(id: string): Promise<RoutineDto>;
  abstract isEligibleRoutineOwner(userId: string): Promise<boolean>;
}

export abstract class UpsertRoutineSubscriptionRepo {
  abstract getSubscriptionOrThrow(): Promise<{
    status: SubscriptionStatus;
    trialEndDate: Date | null;
    plan: SubscriptionPlan;
  }>;
}

@TenantInteractor({
  permissions: [
    { resource: Resource.routines, action: Action.create },
    { resource: Resource.routines, action: Action.update },
  ],
  condition: "AND",
})
export class UpsertRoutineInteractor extends AuthenticatedInteractor<UpsertRoutineData, RoutineDto> {
  constructor(
    private repo: UpsertRoutineRepo,
    private subscriptionRepo: UpsertRoutineSubscriptionRepo,
  ) {
    super();
  }

  @Write({ input: UpsertRoutineSchema, output: RoutineDtoSchema })
  async invoke(data: UpsertRoutineData): Validated<RoutineDto> {
    if (!(await this.repo.isEligibleRoutineOwner(this.user.id)))
      return failAuthorization(CustomErrorCode.routineOwnerIneligible);

    const previous = data.id ? await this.repo.getRoutineByIdOrThrow(data.id) : null;
    if (previous && previous.ownerUserId !== this.user.id)
      return failAuthorization(CustomErrorCode.routineEditNotOwner, ["id"]);

    if (previous) {
      const finalState = mergeRoutineFinalState(previous, data);
      const validation = await runPrecheck(finalState, validateRoutineFinalState);
      if (!validation.ok) return validation;
    }

    const routineLimit = data.id
      ? undefined
      : getEntitlements((await this.subscriptionRepo.getSubscriptionOrThrow()).plan).includedRoutinesPerUser;

    let routine: RoutineDto;
    try {
      routine = await this.repo.upsertRoutineOrThrow(data, routineLimit);
    } catch (error) {
      if (!(error instanceof RoutineLimitExceededError)) throw error;
      return failConflict(CustomErrorCode.routineLimitReached, ["name"], { limit: error.limit });
    }

    return { ok: true as const, data: routine };
  }
}
