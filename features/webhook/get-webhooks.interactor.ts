import type { GetResult } from "@/core/base/base-get.interactor";
import type { DataViewStateRepo } from "@/core/data-view/data-view-state.repo";
import type { QueryParamsPrecheckInteractor } from "@/core/base/query-params-precheck.interactor";
import type { Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";

import { type WebhookDto } from "./webhook.schema";

import { BaseGetRepo } from "@/core/base/base-get.interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { BaseGetInteractor } from "@/core/base/base-get.interactor";
import { GetQueryParamsSchema, type GetQueryParams, createGetResultSchema } from "@/core/base/base-get.schema";
import { Validate } from "@/core/decorators/validate.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { WebhookDtoSchema } from "./webhook.schema";

export abstract class GetWebhooksRepo extends BaseGetRepo<WebhookDto> {}

@AllowInDemoMode
@TenantInteractor({ resource: Resource.api, action: Action.readAll })
export class GetWebhooksInteractor extends BaseGetInteractor<WebhookDto> {
  constructor(
    repo: GetWebhooksRepo,
    viewStateRepo: DataViewStateRepo,
    mode: "interactive" | "api",
    queryParamsPrecheck: QueryParamsPrecheckInteractor,
  ) {
    super(
      repo,
      viewStateRepo,
      mode,
      undefined,
      { sortDescriptor: { field: "createdAt", direction: "desc" } },
      queryParamsPrecheck,
    );
  }

  @Validate(GetQueryParamsSchema)
  @ValidateOutput(createGetResultSchema(WebhookDtoSchema))
  async invoke(params: GetQueryParams = {}): Validated<GetResult<WebhookDto>> {
    return await super.invoke(params);
  }
}
