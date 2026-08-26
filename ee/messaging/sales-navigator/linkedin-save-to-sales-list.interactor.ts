import { CustomErrorCode } from "@/core/validation/validation.types";
import { fail, failUnavailable } from "@/core/validation/interactor-failure-server";
import type { Data, Validated } from "@/core/validation/validation.utils";

import type { MessagingService } from "../messaging.service";
import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";
import type { LinkedinSaveToSalesListResult } from "./sales-navigator.schema";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { z } from "zod";
import { getLocale } from "next-intl/server";

import { Resource, Action, MessagingProvider } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { formatRetryAfter } from "../retry-after";
import { SalesListKindSchema, LinkedinSaveToSalesListResultSchema } from "./sales-navigator.schema";

export const LinkedinSaveToSalesListSchema = z.object({
  connectedAccountId: z.uuid(),
  kind: SalesListKindSchema.default("leads"),
  listId: z.string().min(1),
  providerId: z.string().min(1),
});
type LinkedinSaveToSalesListData = Data<typeof LinkedinSaveToSalesListSchema>;

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.create })
export class LinkedinSaveToSalesListInteractor extends AuthenticatedInteractor<
  LinkedinSaveToSalesListData,
  LinkedinSaveToSalesListResult
> {
  constructor(
    private accountRepo: FindUsableAccountRepo,
    private messagingService: MessagingService,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Write({ input: LinkedinSaveToSalesListSchema, output: LinkedinSaveToSalesListResultSchema, tx: false })
  async invoke(data: LinkedinSaveToSalesListData): Validated<LinkedinSaveToSalesListResult> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const account = await this.accountRepo.findUsableAccountByIdOrThrow(data.connectedAccountId);

    if (account.provider !== MessagingProvider.linkedin)
      return fail(CustomErrorCode.salesNavigatorRequiresLinkedin, [], { provider: account.provider });

    if (account.linkedinProducts.length > 0 && !account.linkedinProducts.includes("sales_navigator"))
      return failUnavailable(CustomErrorCode.salesNavigatorNotAvailable);

    const res = await this.messagingService.saveToSalesList({
      accountId: account.unipileAccountId,
      kind: data.kind,
      listId: data.listId,
      providerId: data.providerId,
    });
    if (!res.ok) return fail(res.error, [], { retryAfter: formatRetryAfter(await getLocale(), res.retryAfterSeconds) });

    return { ok: true as const, data: res.data };
  }
}
