import type { EventService } from "@/features/event/event.service";
import type { OperatorRepo, OperatorUserStatusChangedEvent } from "./operator.repo";
import type { OperatorUserDetailDto, UpdateOperatorUserStatusData } from "./operator.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { DomainEvent } from "@/features/event/domain-events";
import { operatorFailure } from "./operator.errors";
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
    try {
      const user = await this.repo.updateUserStatusOrThrowUnscoped(data, (event) => this.publishUserUpdated(event));
      return { ok: true, data: user };
    } catch (error) {
      const failure = operatorFailure(error);
      if (failure) return failure;
      throw error;
    }
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
