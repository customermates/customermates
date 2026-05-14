import { Resource, Action } from "@/generated/prisma";

import {
  BaseGetConfigurationInteractor,
  GetConfigurationRepo,
  type GetConfigurationResult,
} from "@/core/base/base-get-configuration.interactor";
import { GetConfigurationSchema } from "@/core/base/base-get.schema";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export type GetTasksConfigurationResult = GetConfigurationResult;

export abstract class GetTasksConfigurationRepo extends GetConfigurationRepo {}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.tasks, action: Action.readAll },
    { resource: Resource.tasks, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetTasksConfigurationInteractor extends BaseGetConfigurationInteractor {
  @ValidateOutput(GetConfigurationSchema)
  async invoke(): ReturnType<BaseGetConfigurationInteractor["invoke"]> {
    return super.invoke();
  }
}
