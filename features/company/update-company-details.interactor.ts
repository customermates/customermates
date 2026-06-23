import type { EventService } from "../event/event.service";
import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { CountryCode, Currency, Resource, Action } from "@/generated/prisma";

import { DomainEvent } from "../event/domain-events";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { type Validated, zx } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { getTenantUser } from "@/core/decorators/tenant-context";

export const UpdateCompanyDetailsSchema = z.object({
  name: zx.nonBlankText(255),
  street: z.string().max(255),
  city: z.string().max(255),
  postalCode: z.string().max(32),
  country: z.enum(CountryCode),
  currency: z.enum(Currency).optional(),
});

export type UpdateCompanyDetailsData = Data<typeof UpdateCompanyDetailsSchema>;

export abstract class UpdateCompanyDetailsRepo {
  abstract updateDetails(args: UpdateCompanyDetailsData): Promise<void>;
  abstract getCurrentCurrency(): Promise<Currency>;
}

@TenantInteractor({ resource: Resource.company, action: Action.update })
export class UpdateCompanyDetailsInteractor extends AuthenticatedInteractor<
  UpdateCompanyDetailsData,
  UpdateCompanyDetailsData
> {
  constructor(
    private repo: UpdateCompanyDetailsRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Validate(UpdateCompanyDetailsSchema)
  @ValidateOutput(UpdateCompanyDetailsSchema)
  @Transaction
  async invoke(data: UpdateCompanyDetailsData): Validated<UpdateCompanyDetailsData> {
    await this.repo.updateDetails(data);

    const { companyId } = getTenantUser();

    const currency = data.currency ?? (await this.repo.getCurrentCurrency());

    await this.eventService.publish(DomainEvent.COMPANY_UPDATED, {
      entityId: companyId,
      payload: {
        ...data,
        currency,
      },
    });

    return { ok: true as const, data };
  }
}
