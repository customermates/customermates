import type { RoutineDto, UpsertRoutineData } from "./routine.schema";
import type { Validated } from "@/core/validation/validation.utils";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";
import type { RefinementCtx } from "zod";

import { Resource, Action, RoutineTriggerKind } from "@/generated/prisma";

import { RoutineDtoSchema, UpsertRoutineSchema } from "./routine.schema";

import { getEntitlements } from "@/ee/subscription/entitlements";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

export abstract class UpsertRoutineRepo {
  abstract upsertRoutineOrThrow(args: UpsertRoutineData): Promise<RoutineDto>;
  abstract getRoutineByIdOrThrow(id: string): Promise<RoutineDto>;
  abstract countRoutines(): Promise<number>;
}

export abstract class UpsertRoutineSubscriptionRepo {
  abstract getSubscriptionOrThrow(): Promise<{
    status: SubscriptionStatus;
    trialEndDate: Date | null;
    plan: SubscriptionPlan;
  }>;
}

function analysisInputsChanged(previous: RoutineDto | null, next: RoutineDto): boolean {
  if (!previous) return true;

  return (
    previous.prompt !== next.prompt ||
    previous.enabled !== next.enabled ||
    previous.triggerEvents.join("|") !== next.triggerEvents.join("|")
  );
}

@TenantInteractor({ resource: Resource.api, action: Action.update })
export class UpsertRoutineInteractor extends AuthenticatedInteractor<UpsertRoutineData, RoutineDto> {
  constructor(
    private repo: UpsertRoutineRepo,
    private subscriptionRepo: UpsertRoutineSubscriptionRepo,
    private backgroundTaskService: BackgroundTaskService,
  ) {
    super();
  }

  @Write({
    input: UpsertRoutineSchema,
    output: RoutineDtoSchema,
    precheck: (self, data, ctx) => self.precheck(data, ctx),
  })
  async invoke(data: UpsertRoutineData): Validated<RoutineDto> {
    const previous = data.id ? await this.repo.getRoutineByIdOrThrow(data.id) : null;
    const routine = await this.repo.upsertRoutineOrThrow(data);

    if (routine.triggerKind === RoutineTriggerKind.event && analysisInputsChanged(previous, routine))
      await this.backgroundTaskService.dispatch("analyze-routine-loops", { companyId: this.user.companyId });

    return { ok: true as const, data: routine };
  }

  private async precheck(data: UpsertRoutineData, ctx: RefinementCtx) {
    if (data.id) return;

    const included = getEntitlements((await this.subscriptionRepo.getSubscriptionOrThrow()).plan).includedRoutines;
    if (included === "unlimited") return;
    if ((await this.repo.countRoutines()) < included) return;

    ctx.addIssue({
      code: "custom",
      path: ["name"],
      params: {
        error: included === 0 ? CustomErrorCode.routinesRequirePaidPlan : CustomErrorCode.routineLimitReached,
        limit: included,
      },
    });
  }
}
