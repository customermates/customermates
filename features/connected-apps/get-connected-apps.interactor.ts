import type { AuthService } from "@/features/auth/auth.service";
import type { ConnectedAppRepo } from "./connected-app.repo";
import type { ConnectedApp } from "./connected-app.schema";

import { Resource } from "@/generated/prisma";

import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import { ConnectedAppDtoSchema } from "./connected-app.schema";

@AllowInDemoMode
@TenantInteractor({ resource: Resource.api, read: "all" })
export class GetConnectedAppsInteractor extends AuthenticatedInteractor<void, ConnectedApp[]> {
  constructor(
    private readonly repo: ConnectedAppRepo,
    private readonly authService: Pick<AuthService, "getInteractiveSession">,
    private readonly clock: () => Date = () => new Date(),
  ) {
    super();
  }

  @ValidateOutput(ConnectedAppDtoSchema)
  async invoke(): Promise<{ ok: true; data: ConnectedApp[] }> {
    const session = await this.authService.getInteractiveSession();
    if (!session || session.user.email !== this.user.email) return { ok: true, data: [] };

    const now = this.clock();
    const grants = await this.repo.findGrantsOfLogin(session.user.id);

    return {
      ok: true,
      data: grants
        .filter((grant) => grant.refreshableUntil > now)
        .sort((left, right) => left.connectedAt.getTime() - right.connectedAt.getTime())
        .map((grant) => ({
          id: grant.clientId,
          name: grant.name,
          device: grant.device,
          accountWide: grant.accountWide,
          connectedAt: grant.connectedAt,
          lastActiveAt: grant.lastActiveAt,
        })),
    };
  }
}
