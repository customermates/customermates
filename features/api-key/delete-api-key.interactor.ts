import type { Data } from "@/core/validation/validation.utils";
import type { AuthService } from "@/features/auth/auth.service";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { type Validated } from "@/core/validation/validation.utils";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

const Schema = z.object({
  id: z.string(),
});

export type DeleteApiKeyData = Data<typeof Schema>;

@TenantInteractor({ resource: Resource.api, action: Action.delete })
export class DeleteApiKeyInteractor extends AuthenticatedInteractor<DeleteApiKeyData, string> {
  constructor(private readonly authService: AuthService) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(z.string())
  async invoke(data: DeleteApiKeyData): Validated<string> {
    await this.authService.deleteApiKey(data.id);

    return { ok: true as const, data: data.id };
  }
}
