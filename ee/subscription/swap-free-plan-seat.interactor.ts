import type { Data, Validated } from "@/core/validation/validation.utils";
import type { EventService } from "@/features/event/event.service";
import type { FreePlanMemberRepo } from "./free-plan-member.repo";

import { z } from "zod";
import { Resource, Status } from "@/generated/prisma";

import { DomainEvent } from "@/features/event/domain-events";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import {
  fail,
  failAuthorization,
  failConflict,
  failNotFound,
  unwoundFailure,
} from "@/core/validation/interactor-failure-server";

import { isOnFreePlan } from "./entitlements";

export const SwapFreePlanSeatSchema = z.object({ userId: z.uuid() });
export type SwapFreePlanSeatData = Data<typeof SwapFreePlanSeatSchema>;

const SwapFreePlanSeatResultSchema = z.object({ activeUserId: z.uuid(), pausedUserIds: z.array(z.uuid()) });
export type SwapFreePlanSeatResult = Data<typeof SwapFreePlanSeatResultSchema>;

@TenantInteractor({ resource: Resource.users, manage: "update" })
export class SwapFreePlanSeatInteractor extends AuthenticatedInteractor<SwapFreePlanSeatData, SwapFreePlanSeatResult> {
  constructor(
    private readonly repo: FreePlanMemberRepo,
    private readonly eventService: EventService,
  ) {
    super();
  }

  @Write({ input: SwapFreePlanSeatSchema, output: SwapFreePlanSeatResultSchema })
  async invoke({ userId }: SwapFreePlanSeatData): Validated<SwapFreePlanSeatResult> {
    if (!this.user.role?.isSystemRole) return failAuthorization(CustomErrorCode.planSeatSwapRequiresAdmin);

    const subscription = await this.repo.findPlanSubscriptionUnscoped(this.companyId);
    if (!subscription || !isOnFreePlan(subscription)) return failConflict(CustomErrorCode.planSeatSwapUnavailable);

    const members = await this.repo.listMembersUnscoped(this.companyId);
    const target = members.find((member) => member.id === userId);
    if (!target) return failNotFound(CustomErrorCode.userNotFound, ["userId"]);
    if (!target.pausedByPlanAt) return failConflict(CustomErrorCode.planSeatSwapUnavailable, ["userId"]);
    if (!target.isAdmin) return fail(CustomErrorCode.planSeatSwapTargetNotAdmin, ["userId"]);

    const now = new Date();
    const pausing = members
      .filter((member) => member.status === Status.active && member.id !== target.id)
      .map((member) => member.id);
    await this.repo.pauseMembersForPlanUnscoped({ companyId: this.companyId, userIds: pausing, now, noticeSent: true });
    await this.repo.resumeMembersForPlanUnscoped({ companyId: this.companyId, userIds: [target.id] });

    try {
      await this.eventService.publish(DomainEvent.USER_UPDATED, {
        entityId: target.id,
        payload: { changes: calculateChanges({ status: Status.inactive }, { status: Status.active }) },
      });
      for (const pausedId of pausing) {
        await this.eventService.publish(DomainEvent.USER_UPDATED, {
          entityId: pausedId,
          payload: { changes: calculateChanges({ status: Status.active }, { status: Status.inactive }) },
        });
      }
    } catch (error) {
      return unwoundFailure(error);
    }

    return { ok: true as const, data: { activeUserId: target.id, pausedUserIds: pausing } };
  }
}
