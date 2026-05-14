import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action, EntityType } from "@/generated/prisma";

import { type DealDto, DealByIdResponseSchema } from "../deal.schema";

import { type CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export const GetDealByIdSchema = z.object({
  id: z.uuid(),
});
export type GetDealByIdData = Data<typeof GetDealByIdSchema>;

export abstract class GetDealByIdRepo {
  abstract getDealById(id: string): Promise<DealDto | null>;
}

export abstract class DealCustomColumnRepo {
  abstract findByEntityType(entityType: EntityType): Promise<CustomColumnDto[]>;
}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.deals, action: Action.readAll },
    { resource: Resource.deals, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetDealByIdInteractor extends AuthenticatedInteractor<
  GetDealByIdData,
  { deal: DealDto | null; customColumns: CustomColumnDto[] }
> {
  constructor(
    private repo: GetDealByIdRepo,
    private customColumnsRepo: DealCustomColumnRepo,
  ) {
    super();
  }

  @Validate(GetDealByIdSchema)
  @ValidateOutput(DealByIdResponseSchema)
  async invoke(data: GetDealByIdData): Validated<{ deal: DealDto | null; customColumns: CustomColumnDto[] }> {
    const [deal, customColumns] = await Promise.all([
      this.repo.getDealById(data.id),
      this.customColumnsRepo.findByEntityType(EntityType.deal),
    ]);

    return { ok: true as const, data: { deal, customColumns } };
  }
}
