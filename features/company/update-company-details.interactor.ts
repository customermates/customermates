import type { EventService } from "../event/event.service";
import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { CountryCode, Currency, Resource, Action } from "@/generated/prisma";

import { DomainEvent } from "../event/domain-events";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";
import { getTenantUser } from "@/core/decorators/tenant-context";

const Schema = z.object({
  name: z.string().min(1),
  street: z.string(),
  city: z.string(),
  postalCode: z.string(),
  country: z.enum(CountryCode),
  currency: z.enum(Currency).default(Currency.eur),
});

export type UpdateCompanyDetailsData = Data<typeof Schema>;

export abstract class UpdateCompanyDetailsRepo {
  abstract updateDetails(args: UpdateCompanyDetailsData): Promise<void>;
}

@TentantInteractor({ resource: Resource.company, action: Action.update })
export class UpdateCompanyDetailsInteractor extends BaseInteractor<UpdateCompanyDetailsData, UpdateCompanyDetailsData> {
  constructor(
    private repo: UpdateCompanyDetailsRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(Schema)
  @Transaction
  async invoke(data: UpdateCompanyDetailsData): Validated<UpdateCompanyDetailsData> {
    await this.repo.updateDetails({ ...data });

    const { companyId } = getTenantUser();

    await this.eventService.publish(DomainEvent.COMPANY_UPDATED, {
      entityId: companyId,
      payload: {
        ...data,
        currency: data.currency ?? Currency.eur,
      },
    });

    return { ok: true as const, data };
  }
}
