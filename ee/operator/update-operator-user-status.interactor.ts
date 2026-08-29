import type { EventService } from "@/features/event/event.service";
import type { OperatorRepo, OperatorUserStatusChangedEvent } from "./operator.repo";
import type { OperatorUserDetailDto } from "./operator.schema";

import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { DomainEvent } from "@/features/event/domain-events";
import { UpdateOperatorUserStatusSchema } from "./operator.schema";

@OperatorInteractor
export class UpdateOperatorUserStatusInteractor {
  constructor(
    private readonly repo: OperatorRepo,
    private readonly eventService: EventService,
  ) {}

  async invoke(input: unknown): Promise<OperatorUserDetailDto> {
    const data = UpdateOperatorUserStatusSchema.parse(input);
    return this.repo.updateUserStatusOrThrowUnscoped(data, (event) => this.publishUserUpdated(event));
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
