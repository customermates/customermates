import type { Data } from "@/core/validation/validation.utils";
import type { EventService } from "../event/event.service";

import { Action, Currency, Resource } from "@/generated/prisma";
import { z } from "zod";

import { DomainEvent } from "../event/domain-events";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { type Validated } from "@/core/validation/validation.utils";

export const UpdateCompanySettingsSchema = z.strictObject({ currency: z.enum(Currency) });

export type UpdateCompanySettingsData = Data<typeof UpdateCompanySettingsSchema>;

export abstract class UpdateCompanySettingsRepo {
  abstract updateDetails(args: { currency?: Currency }): Promise<void>;
}

@TenantInteractor({ resource: Resource.company, action: Action.update })
export class UpdateCompanySettingsInteractor extends AuthenticatedInteractor<
  UpdateCompanySettingsData,
  UpdateCompanySettingsData
> {
  constructor(
    private repo: UpdateCompanySettingsRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Validate(UpdateCompanySettingsSchema)
  @Transaction
  @ValidateOutput(UpdateCompanySettingsSchema)
  async invoke(data: UpdateCompanySettingsData): Validated<UpdateCompanySettingsData> {
    await this.repo.updateDetails({ currency: data.currency });

    await this.eventService.publish(DomainEvent.COMPANY_UPDATED, {
      entityId: this.companyId,
      payload: data,
    });

    return { ok: true as const, data };
  }
}
