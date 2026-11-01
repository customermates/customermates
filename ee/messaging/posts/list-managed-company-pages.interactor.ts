import { CustomErrorCode } from "@/core/validation/validation.types";
import { fail } from "@/core/validation/interactor-failure-server";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import type { MessagingService } from "../messaging.service";
import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";
import type { LinkedinCompanyPageList } from "./social-posts.schema";

import { z } from "zod";

import { MessagingProvider, Resource } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { accountNeedsReconnect } from "../account-health";
import { isSocialProvider } from "../provider";
import { retryAfterPhrase } from "../retry-after.server";
import { LinkedinCompanyPageListSchema } from "./social-posts.schema";

export const ListManagedCompanyPagesSchema = z
  .object({
    connectedAccountId: z.uuid(),
  })
  .strict();
type ListManagedCompanyPagesData = Data<typeof ListManagedCompanyPagesSchema>;

export async function requireManagedCompanyPage(
  messagingService: Pick<MessagingService, "listManagedCompanyPages">,
  accountId: string,
  pageId: string,
  field: string,
): Validated<null> {
  const pages = await messagingService.listManagedCompanyPages({ accountId });
  if (!pages.ok) return fail(pages.error, [], { retryAfter: await retryAfterPhrase(pages.retryAfterSeconds) });
  if (!pages.data.data.some((page) => page.id === pageId))
    return fail(CustomErrorCode.socialCompanyPageNotManaged, [field]);

  return { ok: true as const, data: null };
}

@TenantInteractor({ resource: Resource.inboxMessages, read: true })
export class ListManagedCompanyPagesInteractor extends AuthenticatedInteractor<
  ListManagedCompanyPagesData,
  LinkedinCompanyPageList
> {
  constructor(
    private accountRepo: FindUsableAccountRepo,
    private messagingService: MessagingService,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(ListManagedCompanyPagesSchema)
  @ValidateOutput(LinkedinCompanyPageListSchema)
  async invoke(data: ListManagedCompanyPagesData): Validated<LinkedinCompanyPageList> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const account = await this.accountRepo.findUsableAccountByIdOrThrow(data.connectedAccountId);

    if (!isSocialProvider(account.provider))
      return fail(CustomErrorCode.socialActionRequiresSocialAccount, [], { provider: account.provider });
    if (accountNeedsReconnect(account)) return fail(CustomErrorCode.unipileDisconnectedAccount, []);
    if (account.provider !== MessagingProvider.linkedin)
      return fail(CustomErrorCode.linkedinProductRequiresLinkedin, ["profileType"]);

    const res = await this.messagingService.listManagedCompanyPages({ accountId: account.unipileAccountId });
    if (!res.ok) return fail(res.error, [], { retryAfter: await retryAfterPhrase(res.retryAfterSeconds) });

    return { ok: true as const, data: res.data };
  }
}
