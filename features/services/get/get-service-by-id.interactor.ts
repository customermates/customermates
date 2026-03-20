import { z } from "zod";
import { Resource, Action, EntityType } from "@/generated/prisma";

import { type ServiceDto } from "../service.schema";

import { type CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";

export const GetServiceByIdSchema = z.object({
  id: z.uuid(),
});
export type GetServiceByIdData = Data<typeof GetServiceByIdSchema>;

export abstract class GetServiceByIdRepo {
  abstract getServiceById(id: string): Promise<ServiceDto | null>;
}

export abstract class ServiceCustomColumnRepo {
  abstract findByEntityType(entityType: EntityType): Promise<CustomColumnDto[]>;
}

@AllowInDemoMode
@TentantInteractor({
  permissions: [
    { resource: Resource.services, action: Action.readAll },
    { resource: Resource.services, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetServiceByIdInteractor {
  constructor(
    private repo: GetServiceByIdRepo,
    private customColumnsRepo: ServiceCustomColumnRepo,
  ) {}

  @Validate(GetServiceByIdSchema)
  async invoke(data: GetServiceByIdData): Validated<
    {
      service: ServiceDto | null;
      customColumns: CustomColumnDto[];
    },
    GetServiceByIdData
  > {
    const [service, customColumns] = await Promise.all([
      this.repo.getServiceById(data.id),
      this.customColumnsRepo.findByEntityType(EntityType.service),
    ]);

    return { ok: true, data: { service, customColumns } };
  }
}
