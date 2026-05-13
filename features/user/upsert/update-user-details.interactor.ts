import type { Data } from "@/core/validation/validation.utils";
import type { EventService } from "@/features/event/event.service";

import { z } from "zod";
import { CountryCode } from "@/generated/prisma";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { secureUrlSchema, type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { DomainEvent } from "@/features/event/domain-events";
import { BaseInteractor } from "@/core/base/base-interactor";
import { getTenantUser } from "@/core/decorators/tenant-context";

const Schema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  country: z.enum(CountryCode),
  avatarUrl: secureUrlSchema().or(z.literal("")).nullable(),
});
export type UpdateUserDetailsData = Data<typeof Schema>;

export abstract class UpdateUserDetailsRepo {
  abstract updateDetails(args: UpdateUserDetailsData): Promise<UpdateUserDetailsData>;
}

@TentantInteractor()
export class UpdateUserDetailsInteractor extends BaseInteractor<UpdateUserDetailsData, UpdateUserDetailsData> {
  constructor(
    private repo: UpdateUserDetailsRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(Schema)
  @Transaction
  async invoke(data: UpdateUserDetailsData): Validated<UpdateUserDetailsData> {
    const details = await this.repo.updateDetails(data);

    await this.eventService.publish(DomainEvent.USER_UPDATED, {
      entityId: getTenantUser().id,
      payload: {
        firstName: data.firstName,
        lastName: data.lastName,
        country: data.country,
        avatarUrl: data.avatarUrl,
      },
    });

    return { ok: true as const, data: details };
  }
}
