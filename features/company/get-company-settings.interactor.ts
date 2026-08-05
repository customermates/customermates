import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { EntityType, Resource, Action, Currency } from "@/generated/prisma";

import type { Company } from "@/generated/prisma";
import type { EntityTerminologyOverride, TerminologyMap } from "@/features/entity-terminology/entity-terminology.types";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { buildTerminologyMap } from "@/features/entity-terminology/entity-terminology.resolver";

const TerminologyLabelSchema = z.object({ singular: z.string(), plural: z.string() });

const OutputSchema = z.object({
  id: z.string(),
  currency: z.enum(Currency),
  createdAt: z.date(),
  updatedAt: z.date(),
  terminology: z.object({
    presets: z.array(z.object({ entityType: z.enum(EntityType), presetKey: z.string() })),
    labels: z.record(z.enum(EntityType), TerminologyLabelSchema),
  }),
});

export type CompanySettings = Company & {
  terminology: { presets: EntityTerminologyOverride[]; labels: TerminologyMap };
};

export abstract class GetCompanySettingsRepo {
  abstract getDetails(): Promise<Company>;
  abstract getTerminology(): Promise<EntityTerminologyOverride[]>;
}

@AllowInDemoMode
@TenantInteractor({ resource: Resource.company, action: Action.readOwn })
export class GetCompanySettingsInteractor extends AuthenticatedInteractor<void, CompanySettings> {
  constructor(private repo: GetCompanySettingsRepo) {
    super();
  }

  @ValidateOutput(OutputSchema)
  async invoke(): Promise<{ ok: true; data: CompanySettings }> {
    const [company, presets, t] = await Promise.all([
      this.repo.getDetails(),
      this.repo.getTerminology(),
      getTranslations(),
    ]);

    return {
      ok: true as const,
      data: { ...company, terminology: { presets, labels: buildTerminologyMap(presets, (key) => t(key)) } },
    };
  }
}
