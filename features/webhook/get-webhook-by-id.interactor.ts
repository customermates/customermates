import type { WebhookDto } from "./webhook.schema";
import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { WebhookDtoSchema } from "./webhook.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { type Validated } from "@/core/validation/validation.utils";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

const Schema = z.object({
  id: z.uuid(),
});
type GetWebhookByIdData = Data<typeof Schema>;

export abstract class GetWebhookByIdRepo {
  abstract getWebhookById(id: string): Promise<WebhookDto | null>;
}

@TenantInteractor({ resource: Resource.api, action: Action.readAll })
export class GetWebhookByIdInteractor extends AuthenticatedInteractor<GetWebhookByIdData, WebhookDto | null> {
  constructor(private repo: GetWebhookByIdRepo) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(WebhookDtoSchema.nullable())
  async invoke(data: GetWebhookByIdData): Validated<WebhookDto | null> {
    const webhook = await this.repo.getWebhookById(data.id);
    return { ok: true as const, data: webhook };
  }
}
