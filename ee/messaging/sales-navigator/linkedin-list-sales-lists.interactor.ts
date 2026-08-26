import { CustomErrorCode } from "@/core/validation/validation.types";
import { fail, failUnavailable } from "@/core/validation/interactor-failure-server";
import type { Data, Validated } from "@/core/validation/validation.utils";

import type { MessagingService } from "../messaging.service";
import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";
import type { SalesListPage } from "./sales-navigator.schema";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { z } from "zod";
import { getLocale } from "next-intl/server";

import { Resource, Action, MessagingProvider } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { formatRetryAfter } from "../retry-after";
import { SalesListKindSchema, SalesListPageSchema } from "./sales-navigator.schema";

export const LinkedinListSalesListsSchema = z.object({
  connectedAccountId: z.uuid(),
  kind: SalesListKindSchema.default("leads"),
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(100).default(10),
});
type LinkedinListSalesListsData = Data<typeof LinkedinListSalesListsSchema>;

@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class LinkedinListSalesListsInteractor extends AuthenticatedInteractor<
  LinkedinListSalesListsData,
  SalesListPage
> {
  constructor(
    private accountRepo: FindUsableAccountRepo,
    private messagingService: MessagingService,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(LinkedinListSalesListsSchema)
  @ValidateOutput(SalesListPageSchema)
  async invoke(data: LinkedinListSalesListsData): Validated<SalesListPage> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const account = await this.accountRepo.findUsableAccountByIdOrThrow(data.connectedAccountId);

    if (account.provider !== MessagingProvider.linkedin)
      return fail(CustomErrorCode.salesNavigatorRequiresLinkedin, [], { provider: account.provider });

    if (account.linkedinProducts.length > 0 && !account.linkedinProducts.includes("sales_navigator"))
      return failUnavailable(CustomErrorCode.salesNavigatorNotAvailable);

    const res = await this.messagingService.listSalesLists({
      accountId: account.unipileAccountId,
      kind: data.kind,
      offset: data.offset,
      limit: data.limit,
    });
    if (!res.ok) return fail(res.error, [], { retryAfter: formatRetryAfter(await getLocale(), res.retryAfterSeconds) });

    return { ok: true as const, data: res.data };
  }
}
