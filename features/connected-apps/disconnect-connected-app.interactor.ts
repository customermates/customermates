import type { Validated } from "@/core/validation/validation.utils";
import type { AuthService } from "@/features/auth/auth.service";
import type { DisconnectConnectedAppData } from "./connected-app.schema";

import { z } from "zod";
import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failAuthorization } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { DisconnectConnectedAppSchema } from "./connected-app.schema";

@TenantInteractor({ resource: Resource.api, read: "all" })
export class DisconnectConnectedAppInteractor extends AuthenticatedInteractor<DisconnectConnectedAppData, string> {
  constructor(private readonly authService: Pick<AuthService, "getInteractiveSession" | "revokeOauthClientAccess">) {
    super();
  }

  @Validate(DisconnectConnectedAppSchema)
  @ValidateOutput(z.string())
  async invoke(data: DisconnectConnectedAppData): Validated<string> {
    const session = await this.authService.getInteractiveSession();
    if (!session || session.user.email !== this.user.email) return failAuthorization(CustomErrorCode.permissionDenied);

    await this.authService.revokeOauthClientAccess({
      authUserId: session.user.id,
      companyId: this.companyId,
      clientId: data.id,
    });

    return { ok: true as const, data: data.id };
  }
}
