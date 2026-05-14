import type { Data, Validated } from "@/core/validation/validation.utils";
import type { WidgetService } from "@/features/widget/widget.service";

import { z } from "zod";
import { SalesType } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { getTenantUser } from "@/core/decorators/tenant-context";

const SeedSchema = z.object({
  salesType: z.enum(SalesType),
  keepDemoData: z.boolean().default(true),
});

export type SeedOnboardingData = Data<typeof SeedSchema>;

export abstract class SeedOnboardingDataRepo {
  abstract seedOnboardingData(args: {
    userId: string;
    salesType: SalesType;
    keepDemoData: boolean;
  }): Promise<{ alreadySeeded: boolean }>;
}

@TenantInteractor()
export class SeedOnboardingDataInteractor extends AuthenticatedInteractor<SeedOnboardingData, null> {
  constructor(
    private repo: SeedOnboardingDataRepo,
    private widgetService: WidgetService,
  ) {
    super();
  }

  @Validate(SeedSchema)
  @ValidateOutput(z.null())
  async invoke(data: SeedOnboardingData): Validated<null> {
    const { id } = getTenantUser();
    const result = await this.repo.seedOnboardingData({
      userId: id,
      salesType: data.salesType,
      keepDemoData: data.keepDemoData,
    });
    if (!result.alreadySeeded) await this.widgetService.recalculateUserWidgets();
    return { ok: true as const, data: null };
  }
}
