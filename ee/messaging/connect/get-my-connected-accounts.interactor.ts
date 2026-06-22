import type { ConnectedAccountDto } from "../messaging.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { Action, Resource } from "@/generated/prisma";

import { ConnectedAccountDtoSchema } from "../messaging.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

export abstract class GetMyConnectedAccountsRepo {
  abstract listAccounts(): Promise<ConnectedAccountDto[]>;
}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetMyConnectedAccountsInteractor extends AuthenticatedInteractor<void, ConnectedAccountDto[]> {
  constructor(private repo: GetMyConnectedAccountsRepo) {
    super();
  }

  @ValidateOutput(ConnectedAccountDtoSchema)
  async invoke(): Validated<ConnectedAccountDto[]> {
    const accounts = await this.repo.listAccounts();

    return { ok: true as const, data: accounts };
  }
}
