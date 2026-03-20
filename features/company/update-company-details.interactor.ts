import { z } from "zod";

import { CountryCode, Currency, Resource, Action } from "@/generated/prisma";

import { DomainEvent } from "../event/domain-events";
import { EventService } from "../event/event.service";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { UserAccessor } from "@/core/base/user-accessor";

const Schema = z.object({
  name: z.string().min(1),
  street: z.string().min(1),
  city: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.enum(CountryCode),
  currency: z.enum(Currency).default(Currency.eur),
});

export type UpdateCompanyDetailsData = Data<typeof Schema>;

export abstract class UpdateCompanyDetailsRepo {
  abstract updateDetails(args: UpdateCompanyDetailsData): Promise<void>;
}

@TentantInteractor({ resource: Resource.company, action: Action.update })
export class UpdateCompanyDetailsInteractor extends UserAccessor {
  constructor(
    private repo: UpdateCompanyDetailsRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Validate(Schema)
  async invoke(data: UpdateCompanyDetailsData): Validated<UpdateCompanyDetailsData> {
    await this.repo.updateDetails({ ...data });

    const { companyId } = this.user;

    await this.eventService.publish(DomainEvent.COMPANY_UPDATED, {
      entityId: companyId,
      payload: {
        ...data,
        currency: data.currency ?? Currency.eur,
      },
    });

    return { ok: true, data };
  }
}
