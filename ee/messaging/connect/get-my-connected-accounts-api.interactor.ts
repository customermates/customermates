import type { Data, Validated } from "@/core/validation/validation.utils";
import type { GetMyConnectedAccountsRepo } from "./get-my-connected-accounts.interactor";

import { Action, Resource } from "@/generated/prisma";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

import { ConnectedAccountDtoSchema } from "../messaging.schema";

type ConnectedAccountApiDto = Data<typeof ConnectedAccountDtoSchema>;

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetMyConnectedAccountsApiInteractor extends AuthenticatedInteractor<void, ConnectedAccountApiDto[]> {
  constructor(private repo: GetMyConnectedAccountsRepo) {
    super();
  }

  @ValidateOutput(ConnectedAccountDtoSchema)
  async invoke(): Validated<ConnectedAccountApiDto[]> {
    return { ok: true as const, data: await this.repo.listAccounts() };
  }
}
