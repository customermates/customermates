import type { EventService } from "../event/event.service";
import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Currency, Resource, Action } from "@/generated/prisma";

import { DomainEvent } from "../event/domain-events";
import { dealStageWeightSchema } from "../deals/deal-weighting";

import type { EntityTerminologyEntry } from "@/features/entity-terminology/entity-terminology.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

export const DealStageWeightSchema = z.object({
  optionValue: z.string(),
  weight: dealStageWeightSchema().optional(),
});

export const UpdateCompanySettingsSchema = z.strictObject({ currency: z.enum(Currency) });

export type DealStageWeight = Data<typeof DealStageWeightSchema>;

export type UpdateCompanySettingsData = Data<typeof UpdateCompanySettingsSchema>;

export abstract class UpdateCompanySettingsRepo {
  abstract updateDetails(args: { currency?: Currency; dealWeightingColumnId?: string | null }): Promise<void>;
  abstract upsertTerminology(entries: EntityTerminologyEntry[]): Promise<void>;
  abstract setDealStageWeights(entries: DealStageWeight[]): Promise<void>;
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
