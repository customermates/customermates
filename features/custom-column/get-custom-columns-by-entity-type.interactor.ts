import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { EntityType } from "@/generated/prisma";

import { type CustomColumnDto, CustomColumnDtoSchema } from "./custom-column.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

const Schema = z.object({
  entityType: z.enum(EntityType),
});

export type GetCustomColumnsByEntityTypeData = Data<typeof Schema>;

export abstract class GetCustomColumnsByEntityTypeRepo {
  abstract findByEntityType(entityType: EntityType): Promise<CustomColumnDto[]>;
}

@AllowInDemoMode
@TenantInteractor()
export class GetCustomColumnsByEntityTypeInteractor extends AuthenticatedInteractor<
  GetCustomColumnsByEntityTypeData,
  CustomColumnDto[]
> {
  constructor(private repo: GetCustomColumnsByEntityTypeRepo) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(CustomColumnDtoSchema)
  async invoke(data: GetCustomColumnsByEntityTypeData): Validated<CustomColumnDto[]> {
    return { ok: true as const, data: await this.repo.findByEntityType(data.entityType) };
  }
}
