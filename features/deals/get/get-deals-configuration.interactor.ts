import { Resource, Action } from "@/generated/prisma";

import {
  BaseGetConfigurationInteractor,
  GetConfigurationRepo,
  type GetConfigurationResult,
} from "@/core/base/base-get-configuration.interactor";
import { GetConfigurationSchema } from "@/core/base/base-get.schema";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export type GetDealsConfigurationResult = GetConfigurationResult;

export abstract class GetDealsConfigurationRepo extends GetConfigurationRepo {}

@AllowInDemoMode
@TentantInteractor({
  permissions: [
    { resource: Resource.deals, action: Action.readAll },
    { resource: Resource.deals, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetDealsConfigurationInteractor extends BaseGetConfigurationInteractor {
  @ValidateOutput(GetConfigurationSchema)
  async invoke(): ReturnType<BaseGetConfigurationInteractor["invoke"]> {
    return super.invoke();
  }
}
