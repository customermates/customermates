import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { AuthService } from "@/features/auth/auth.service";

const Schema = z.object({
  id: z.string(),
});

export type DeleteApiKeyData = Data<typeof Schema>;

export abstract class DeleteApiKeyRepo {
  abstract getCrmApiKeyId(): Promise<string | null>;
}

@TentantInteractor({ resource: Resource.api, action: Action.delete })
export class DeleteApiKeyInteractor {
  constructor(
    private readonly authService: AuthService,
    private readonly repo: DeleteApiKeyRepo,
  ) {}

  @Validate(Schema)
  async invoke(data: DeleteApiKeyData): Validated<string, DeleteApiKeyData> {
    const crmApiKeyId = await this.repo.getCrmApiKeyId();

    if (crmApiKeyId && crmApiKeyId === data.id) throw new Error("Cannot delete the CRM Agent API key");

    await this.authService.deleteApiKey(data.id);

    return { ok: true, data: data.id };
  }
}
