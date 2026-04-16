import type { Data } from "@/core/validation/validation.utils";
import type { AuthService } from "@/features/auth/auth.service";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { type Validated } from "@/core/validation/validation.utils";
import { BaseInteractor } from "@/core/base/base-interactor";

const Schema = z.object({
  id: z.string(),
});

export type DeleteApiKeyData = Data<typeof Schema>;

export abstract class DeleteApiKeyRepo {
  abstract getCrmApiKeyId(): Promise<string | null>;
}

@TentantInteractor({ resource: Resource.api, action: Action.delete })
export class DeleteApiKeyInteractor extends BaseInteractor<DeleteApiKeyData, string> {
  constructor(
    private readonly authService: AuthService,
    private readonly repo: DeleteApiKeyRepo,
  ) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(z.string())
  async invoke(data: DeleteApiKeyData): Validated<string> {
    const crmApiKeyId = await this.repo.getCrmApiKeyId();

    if (crmApiKeyId && crmApiKeyId === data.id) throw new Error("Cannot delete the CRM Agent API key");

    await this.authService.deleteApiKey(data.id);

    return { ok: true as const, data: data.id };
  }
}
