import { Resource, Action } from "@/generated/prisma";

import { type WebhookDto } from "./webhook.schema";

import { BaseGetRepo, P13nRepo } from "@/core/base/base-get.interactor";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { BaseGetInteractor } from "@/core/base/base-get.interactor";
import { GetQueryParamsSchema, type GetQueryParams } from "@/core/base/base-get.schema";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";

export abstract class GetWebhooksRepo extends BaseGetRepo<WebhookDto> {}

@AllowInDemoMode
@TentantInteractor({ resource: Resource.api, action: Action.readAll })
export class GetWebhooksInteractor extends BaseGetInteractor<WebhookDto> {
  constructor(repo: GetWebhooksRepo, p13nRepo: P13nRepo) {
    super(repo, p13nRepo, {
      sortDescriptor: { field: "createdAt", direction: "desc" },
    });
  }

  @Enforce(GetQueryParamsSchema)
  async invoke(params: GetQueryParams = {}) {
    return await super.invoke(params);
  }
}
