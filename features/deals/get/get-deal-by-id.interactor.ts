import { z } from "zod";
import { Resource, Action, EntityType } from "@/generated/prisma";

import { type DealDto } from "../deal.schema";

import { type CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";

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
@TentantInteractor({
  permissions: [
    { resource: Resource.deals, action: Action.readAll },
    { resource: Resource.deals, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetDealByIdInteractor {
  constructor(
    private repo: GetDealByIdRepo,
    private customColumnsRepo: DealCustomColumnRepo,
  ) {}

  @Validate(GetDealByIdSchema)
  async invoke(data: GetDealByIdData): Validated<
    {
      deal: DealDto | null;
      customColumns: CustomColumnDto[];
    },
    GetDealByIdData
  > {
    const [deal, customColumns] = await Promise.all([
      this.repo.getDealById(data.id),
      this.customColumnsRepo.findByEntityType(EntityType.deal),
    ]);

    return { ok: true, data: { deal, customColumns } };
  }
}
