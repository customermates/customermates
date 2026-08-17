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

export const DealStageWeightSchema = z.object({
  optionValue: z.string(),
  weight: z.number().min(0).max(100),
});

export const UpdateCompanySettingsSchema = z.object({
  currency: z.enum(Currency).optional(),
  terminology: z.array(EntityTerminologyEntrySchema).optional(),
  dealWeightingColumnId: z.string().nullable().optional(),
  dealStageWeights: z.array(DealStageWeightSchema).optional(),
});

export type DealStageWeight = Data<typeof DealStageWeightSchema>;

export type UpdateCompanySettingsData = Data<typeof UpdateCompanySettingsSchema>;

export abstract class UpdateCompanySettingsRepo {
  abstract updateDetails(args: { currency?: Currency; dealWeightingColumnId?: string | null }): Promise<void>;
  abstract upsertTerminology(entries: EntityTerminologyEntry[]): Promise<void>;
  abstract setDealStageWeights(entries: DealStageWeight[]): Promise<void>;
  abstract recalculateDealWeightedValues(): Promise<void>;
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

    const details: { currency?: Currency; dealWeightingColumnId?: string | null } = {};

    if (data.currency) details.currency = data.currency;
    if (data.dealWeightingColumnId !== undefined) details.dealWeightingColumnId = data.dealWeightingColumnId;

    if (Object.keys(details).length > 0) await this.repo.updateDetails(details);

    if (data.dealStageWeights?.length) await this.repo.setDealStageWeights(data.dealStageWeights);

    if (data.dealWeightingColumnId !== undefined || data.dealStageWeights?.length)
      await this.repo.recalculateDealWeightedValues();

    const { companyId } = getTenantUser();

    await this.eventService.publish(DomainEvent.COMPANY_UPDATED, {
      entityId: companyId,
      payload: data,
    });

    return { ok: true as const, data };
  }
}
