import type { GetIncomingWebhooksRepo } from "./get-incoming-webhooks.repo";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { DataViewStateRepo } from "@/core/data-view/data-view-state.repo";
import type { QueryParamsPrecheckInteractor } from "@/core/base/query-params-precheck.interactor";
import type { Validated } from "@/core/validation/validation.utils";

import { Resource } from "@/generated/prisma";

import { type IncomingWebhookDto, IncomingWebhookDtoSchema } from "./incoming-webhook.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { BaseGetInteractor } from "@/core/base/base-get.interactor";
import { GetQueryParamsSchema, type GetQueryParams, createGetResultSchema } from "@/core/base/base-get.schema";
import { Validate } from "@/core/decorators/validate.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

@AllowInDemoMode
@TenantInteractor({ resource: Resource.api, read: "all" })
export class GetIncomingWebhooksInteractor extends BaseGetInteractor<IncomingWebhookDto> {
  constructor(
    repo: GetIncomingWebhooksRepo,
    viewStateRepo: DataViewStateRepo,
    mode: "interactive" | "api",
    queryParamsPrecheck: QueryParamsPrecheckInteractor,
  ) {
    super(
      repo,
      viewStateRepo,
      mode,
      { sortDescriptor: { field: "createdAt", direction: "desc" } },
      queryParamsPrecheck,
    );
  }

  @Validate(GetQueryParamsSchema)
  @ValidateOutput(createGetResultSchema(IncomingWebhookDtoSchema))
  async invoke(params: GetQueryParams = {}): Validated<GetResult<IncomingWebhookDto>> {
    return await super.invoke(params);
  }
}
