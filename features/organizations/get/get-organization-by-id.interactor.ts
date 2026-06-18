import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action, EntityType } from "@/generated/prisma";

import { type OrganizationDto, OrganizationByIdResponseSchema } from "../organization.schema";

import { type CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

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
@TenantInteractor({
  permissions: [
    { resource: Resource.organizations, action: Action.readAll },
    { resource: Resource.organizations, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetOrganizationByIdInteractor extends AuthenticatedInteractor<
  GetOrganizationByIdData,
  { organization: OrganizationDto | null; customColumns: CustomColumnDto[] }
> {
  constructor(
    private repo: GetOrganizationByIdRepo,
    private customColumnsRepo: OrganizationCustomColumnRepo,
  ) {
    super();
  }

  @Validate(GetOrganizationByIdSchema)
  @ValidateOutput(OrganizationByIdResponseSchema)
  async invoke(
    data: GetOrganizationByIdData,
  ): Validated<{ organization: OrganizationDto | null; customColumns: CustomColumnDto[] }> {
    const [organization, customColumns] = await Promise.all([
      this.repo.getOrganizationById(data.id),
      this.customColumnsRepo.findByEntityType(EntityType.organization),
    ]);

    return { ok: true as const, data: { organization, customColumns } };
  }
}
