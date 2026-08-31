import type { EventService } from "@/features/event/event.service";
import type { OperatorRepo, OperatorUserStatusChangedEvent } from "./operator.repo";
import type { OperatorUserDetailDto, UpdateOperatorUserStatusData } from "./operator.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { failConflict, failNotFound, failUnavailable } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { DomainEvent } from "@/features/event/domain-events";
import { OperatorUserDetailDtoSchema, UpdateOperatorUserStatusSchema } from "./operator.schema";

@OperatorInteractor
export class UpdateOperatorUserStatusInteractor {
  constructor(
    private readonly repo: OperatorRepo,
    private readonly eventService: EventService,
  ) {}

  @Enforce(UpdateOperatorUserStatusSchema)
  @ValidateOutput(OperatorUserDetailDtoSchema)
  async invoke(data: UpdateOperatorUserStatusData): Validated<OperatorUserDetailDto> {
    const result = await this.repo.updateUserStatusUnscoped(data, (event) => this.publishUserUpdated(event));

    if (result === "conflict") return failConflict(CustomErrorCode.operatorConflict);
    if (result === "notFound") return failNotFound(CustomErrorCode.userNotFound);
    if (result === "unavailable") return failUnavailable(CustomErrorCode.operatorUnavailable);

    return { ok: true, data: result };
  }

  private async publishUserUpdated(event: OperatorUserStatusChangedEvent): Promise<void> {
    await this.eventService.publish(
      DomainEvent.USER_UPDATED,
      {
        entityId: event.userId,
        payload: {
          firstName: event.firstName,
          lastName: event.lastName,
          country: event.country,
          status: event.status,
          avatarUrl: event.avatarUrl,
          ...(event.roleId ? { roleId: event.roleId } : {}),
        },
      },
      { systemCompanyId: event.companyId },
    );
  }
}
