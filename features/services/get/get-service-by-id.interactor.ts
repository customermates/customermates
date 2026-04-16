import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action, EntityType } from "@/generated/prisma";

import { type ServiceDto, ServiceByIdResponseSchema } from "../service.schema";

import { type CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

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
export class GetServiceByIdInteractor extends BaseInteractor<
  GetServiceByIdData,
  { service: ServiceDto | null; customColumns: CustomColumnDto[] }
> {
  constructor(
    private repo: GetServiceByIdRepo,
    private customColumnsRepo: ServiceCustomColumnRepo,
  ) {
    super();
  }

  @Validate(GetServiceByIdSchema)
  @ValidateOutput(ServiceByIdResponseSchema)
  async invoke(data: GetServiceByIdData): Validated<{ service: ServiceDto | null; customColumns: CustomColumnDto[] }> {
    const [service, customColumns] = await Promise.all([
      this.repo.getServiceById(data.id),
      this.customColumnsRepo.findByEntityType(EntityType.service),
    ]);

    return { ok: true as const, data: { service, customColumns } };
  }
}
