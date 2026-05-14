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

export type GetContactsConfigurationResult = GetConfigurationResult;

export abstract class GetContactsConfigurationRepo extends GetConfigurationRepo {}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.contacts, action: Action.readAll },
    { resource: Resource.contacts, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetContactsConfigurationInteractor extends BaseGetConfigurationInteractor {
  @ValidateOutput(GetConfigurationSchema)
  async invoke(): ReturnType<BaseGetConfigurationInteractor["invoke"]> {
    return super.invoke();
  }
}
