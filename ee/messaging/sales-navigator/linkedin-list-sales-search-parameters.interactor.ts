import type { Data, Validated } from "@/core/validation/validation.utils";

import type { MessagingService } from "../messaging.service";
import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";
import type { SalesSearchParameterPage } from "./sales-navigator.schema";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { z } from "zod";
import { getLocale, getTranslations } from "next-intl/server";

import { Resource, Action, MessagingProvider } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { createZodError } from "@/core/validation/validation.utils";
import { formatRetryAfter } from "../retry-after";
import { SalesSearchParameterPageSchema, SalesSearchParameterTypeSchema } from "./sales-navigator.schema";

export const LinkedinListSalesSearchParametersSchema = z.object({
  connectedAccountId: z.uuid(),
  type: SalesSearchParameterTypeSchema,
  keywords: z.string().optional(),
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(100).default(10),
});
type LinkedinListSalesSearchParametersData = Data<typeof LinkedinListSalesSearchParametersSchema>;

@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class LinkedinListSalesSearchParametersInteractor extends AuthenticatedInteractor<
  LinkedinListSalesSearchParametersData,
  SalesSearchParameterPage
> {
  constructor(
    private accountRepo: FindUsableAccountRepo,
    private messagingService: MessagingService,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(LinkedinListSalesSearchParametersSchema)
  @ValidateOutput(SalesSearchParameterPageSchema)
  async invoke(data: LinkedinListSalesSearchParametersData): Validated<SalesSearchParameterPage> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const account = await this.accountRepo.findUsableAccountByIdOrThrow(data.connectedAccountId);

    if (account.provider !== MessagingProvider.linkedin) {
      const t = await getTranslations();
      return {
        ok: false,
        error: createZodError<SalesSearchParameterPage>(
          t("Common.errors.salesNavigatorRequiresLinkedin", { provider: account.provider }),
        ),
      };
    }

    if (account.linkedinProducts.length > 0 && !account.linkedinProducts.includes("sales_navigator")) {
      const t = await getTranslations();
      return {
        ok: false,
        error: createZodError<SalesSearchParameterPage>(t("Common.errors.salesNavigatorNotAvailable")),
      };
    }

    const res = await this.messagingService.listSalesSearchParameters({
      accountId: account.unipileAccountId,
      type: data.type,
      keywords: data.keywords,
      offset: data.offset,
      limit: data.limit,
    });
    if (!res.ok) {
      const t = await getTranslations();
      return {
        ok: false,
        error: createZodError<SalesSearchParameterPage>(
          t(`Common.errors.${res.error}`, { retryAfter: formatRetryAfter(await getLocale(), res.retryAfterSeconds) }),
        ),
      };
    }

    return { ok: true as const, data: res.data };
  }
}
