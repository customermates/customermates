import type { EventService } from "../event/event.service";
import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Currency, Resource, Action } from "@/generated/prisma";

import { DomainEvent } from "../event/domain-events";

import {
  EntityTerminologyEntrySchema,
  type EntityTerminologyEntry,
} from "@/features/entity-terminology/entity-terminology.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { getTenantUser } from "@/core/decorators/tenant-context";

export const UpdateCompanySettingsSchema = z.object({
  currency: z.enum(Currency).optional(),
  terminology: z.array(EntityTerminologyEntrySchema).optional(),
});

export type UpdateCompanySettingsData = Data<typeof UpdateCompanySettingsSchema>;

export abstract class UpdateCompanySettingsRepo {
  abstract updateDetails(args: { currency: Currency }): Promise<void>;
  abstract upsertTerminology(entries: EntityTerminologyEntry[]): Promise<void>;
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
  @ValidateOutput(UpdateCompanySettingsSchema)
  @Transaction
  async invoke(data: UpdateCompanySettingsData): Validated<UpdateCompanySettingsData> {
    if (data.terminology?.length) await this.repo.upsertTerminology(data.terminology);

    if (data.currency) await this.repo.updateDetails({ currency: data.currency });

    const { companyId } = getTenantUser();

    await this.eventService.publish(DomainEvent.COMPANY_UPDATED, {
      entityId: companyId,
      payload: data,
    });

    return { ok: true as const, data };
  }
}
