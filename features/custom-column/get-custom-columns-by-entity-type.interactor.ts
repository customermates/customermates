import { z } from "zod";
import { EntityType } from "@/generated/prisma";

import { type CustomColumnDto } from "./custom-column.schema";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { Data } from "@/core/validation/validation.utils";

const Schema = z.object({
  entityType: z.enum(EntityType),
});

export type GetCustomColumnsByEntityTypeData = Data<typeof Schema>;

export abstract class GetCustomColumnsByEntityTypeRepo {
  abstract findByEntityType(entityType: EntityType): Promise<CustomColumnDto[]>;
}

@AllowInDemoMode
@TentantInteractor()
export class GetCustomColumnsByEntityTypeInteractor {
  constructor(private repo: GetCustomColumnsByEntityTypeRepo) {}

  @Enforce(Schema)
  async invoke(data: GetCustomColumnsByEntityTypeData): Promise<CustomColumnDto[]> {
    return await this.repo.findByEntityType(data.entityType);
  }
}
