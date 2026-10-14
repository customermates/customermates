import type { Validated } from "@/core/validation/validation.utils";

import { Resource } from "@/generated/prisma";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

@AllowInDemoMode
@TenantInteractor({ resource: Resource.api, read: "all" })
export class AuthorizeMcpConnectionInteractor extends AuthenticatedInteractor<void, true> {
  invoke(): Validated<true> {
    return Promise.resolve({ ok: true as const, data: true as const });
  }
}
