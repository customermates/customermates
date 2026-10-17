import type { Data, Validated } from "@/core/validation/validation.utils";
import type { AuthService } from "@/features/auth/auth.service";

import { z } from "zod";
import { Resource } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

const Schema = z.object({
  id: z.string(),
});

export type DeleteApiKeyData = Data<typeof Schema>;

@TenantInteractor({ resource: Resource.api, manage: "delete" })
export class DeleteApiKeyInteractor extends AuthenticatedInteractor<DeleteApiKeyData, string> {
  constructor(private readonly authService: AuthService) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(z.string())
  async invoke(data: DeleteApiKeyData): Validated<string> {
    if (!(await this.authService.deleteApiKey(data.id, this.companyId)))
      return failNotFound(CustomErrorCode.apiKeyNotFound, ["id"]);

    return { ok: true as const, data: data.id };
  }
}
