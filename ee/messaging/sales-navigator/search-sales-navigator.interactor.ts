import type { Data, Validated } from "@/core/validation/validation.utils";

import type { MessagingService } from "../messaging.service";
import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";
import type { SalesListItemPage } from "./sales-navigator.schema";

import { z } from "zod";
import { getLocale, getTranslations } from "next-intl/server";

import { Resource, Action, MessagingProvider } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { createZodError } from "@/core/validation/validation.utils";
import { formatRetryAfter } from "../retry-after";
import { SalesListItemPageSchema } from "./sales-navigator.schema";

export const SearchSalesNavigatorSchema = z.object({
  connectedAccountId: z.uuid(),
  url: z
    .string()
    .url()
    .refine(
      (value) => {
        try {
          const { hostname, pathname } = new URL(value);
          return (hostname === "linkedin.com" || hostname.endsWith(".linkedin.com")) && pathname.startsWith("/sales");
        } catch {
          return false;
        }
      },
      {
        error: "url must be a LinkedIn Sales Navigator search URL (linkedin.com/sales/...)",
      },
    ),
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(100).default(10),
});
type SearchSalesNavigatorData = Data<typeof SearchSalesNavigatorSchema>;

@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class SearchSalesNavigatorInteractor extends AuthenticatedInteractor<
  SearchSalesNavigatorData,
  SalesListItemPage
> {
  constructor(
    private accountRepo: FindUsableAccountRepo,
    private messagingService: MessagingService,
  ) {
    super();
  }

  @Validate(SearchSalesNavigatorSchema)
  @ValidateOutput(SalesListItemPageSchema)
  async invoke(data: SearchSalesNavigatorData): Validated<SalesListItemPage> {
    const account = await this.accountRepo.findUsableAccountByIdOrThrow(data.connectedAccountId);

    if (account.provider !== MessagingProvider.linkedin) {
      const t = await getTranslations();
      return {
        ok: false,
        error: createZodError<SalesListItemPage>(
          t("Common.errors.salesNavigatorRequiresLinkedin", { provider: account.provider }),
        ),
      };
    }

    const res = await this.messagingService.searchSalesNavigator({
      accountId: account.unipileAccountId,
      url: data.url,
      offset: data.offset,
      limit: data.limit,
    });
    if (!res.ok) {
      const t = await getTranslations();
      return {
        ok: false,
        error: createZodError<SalesListItemPage>(
          t(`Common.errors.${res.error}`, { retryAfter: formatRetryAfter(await getLocale(), res.retryAfterSeconds) }),
        ),
      };
    }

    return { ok: true as const, data: res.data };
  }
}
