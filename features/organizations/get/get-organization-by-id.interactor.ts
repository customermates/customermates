import { z } from "zod";
import { Resource, Action, EntityType } from "@/generated/prisma";

import { type OrganizationDto } from "../organization.schema";

import { type CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";

export const GetOrganizationByIdSchema = z.object({
  id: z.uuid(),
});
export type GetOrganizationByIdData = Data<typeof GetOrganizationByIdSchema>;

export abstract class GetOrganizationByIdRepo {
  abstract getOrganizationById(id: string): Promise<OrganizationDto | null>;
}

export abstract class OrganizationCustomColumnRepo {
  abstract findByEntityType(entityType: EntityType): Promise<CustomColumnDto[]>;
}

@AllowInDemoMode
@TentantInteractor({
  permissions: [
    { resource: Resource.organizations, action: Action.readAll },
    { resource: Resource.organizations, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetOrganizationByIdInteractor {
  constructor(
    private repo: GetOrganizationByIdRepo,
    private customColumnsRepo: OrganizationCustomColumnRepo,
  ) {}

  @Validate(GetOrganizationByIdSchema)
  async invoke(data: GetOrganizationByIdData): Validated<
    {
      organization: OrganizationDto | null;
      customColumns: CustomColumnDto[];
    },
    GetOrganizationByIdData
  > {
    const [organization, customColumns] = await Promise.all([
      this.repo.getOrganizationById(data.id),
      this.customColumnsRepo.findByEntityType(EntityType.organization),
    ]);

    return { ok: true, data: { organization, customColumns } };
  }
}
