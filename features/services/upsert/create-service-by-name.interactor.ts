import type { CreateServiceInteractor } from "./create-service.interactor";
import type { ServiceDto } from "../service.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";

export type CreateServiceByNameData = { name: string; userId?: string | null };

@TenantInteractor({ resource: Resource.services, action: Action.create })
export class CreateServiceByNameInteractor {
  constructor(private readonly createServiceInteractor: CreateServiceInteractor) {}

  async invoke(data: CreateServiceByNameData): Validated<ServiceDto> {
    return this.createServiceInteractor.invoke({
      name: data?.name,
      amount: 100,
      notes: null,
      userIds: data?.userId ? [data.userId] : [],
      dealIds: [],
      taskIds: [],
      customFieldValues: [],
    });
  }
}
