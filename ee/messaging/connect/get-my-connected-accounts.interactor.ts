import type { ConnectedAccountDto } from "../messaging.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { Resource } from "@/generated/prisma";

import { ConnectedAccountAppDtoSchema } from "../messaging.schema";
import { toConnectedAccountDto } from "./connected-account-dto";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import type { GetMyConnectedAccountsRepo } from "./get-my-connected-accounts.repo";

@AllowInDemoMode
@TenantInteractor({ resource: Resource.inboxMessages, read: true })
export class GetMyConnectedAccountsInteractor extends AuthenticatedInteractor<void, ConnectedAccountDto[]> {
  constructor(private repo: GetMyConnectedAccountsRepo) {
    super();
  }

  @ValidateOutput(ConnectedAccountAppDtoSchema)
  async invoke(): Validated<ConnectedAccountDto[]> {
    const accounts = await this.repo.listAccounts();

    return { ok: true as const, data: accounts.map(toConnectedAccountDto) };
  }
}
