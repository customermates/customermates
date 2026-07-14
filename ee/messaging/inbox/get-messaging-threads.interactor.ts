import type { P13nRepo } from "@/core/base/base-get.interactor";
import type { QueryParamsPrecheckInteractor } from "@/core/base/query-params-precheck.interactor";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import type { MessagingThread } from "../messaging.schema";
import type { GetQueryParams } from "@/core/base/base-get.schema";

import { Resource, Action } from "@/generated/prisma";

import { MessagingThreadSchema } from "../messaging.schema";

import { BaseGetInteractor, BaseGetRepo } from "@/core/base/base-get.interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { GetQueryParamsSchema, createGetResultSchema } from "@/core/base/base-get.schema";

export abstract class GetMessagingThreadsRepo extends BaseGetRepo<MessagingThread> {}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetMessagingThreadsInteractor extends BaseGetInteractor<MessagingThread> {
  constructor(
    repo: GetMessagingThreadsRepo,
    p13nRepo: P13nRepo,
    mode: "interactive" | "api",
    queryParamsPrecheck: QueryParamsPrecheckInteractor,
    private entitlements: EntitlementService,
  ) {
    super(repo, p13nRepo, mode, undefined, { pagination: { page: 1, pageSize: 25 } }, queryParamsPrecheck);
  }

  @Validate(GetQueryParamsSchema)
  @ValidateOutput(createGetResultSchema(MessagingThreadSchema))
  async invoke(params: GetQueryParams = {}) {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    return await super.invoke(params);
  }
}
