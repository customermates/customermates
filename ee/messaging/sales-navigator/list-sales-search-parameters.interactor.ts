import type { Data, Validated } from "@/core/validation/validation.utils";

import type { MessagingService } from "../messaging.service";
import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";
import type { SalesSearchParameterPage } from "./sales-navigator.schema";

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

export const ListSalesSearchParametersSchema = z.object({
  connectedAccountId: z.uuid(),
  type: SalesSearchParameterTypeSchema,
  keywords: z.string().optional(),
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(100).default(10),
});
type ListSalesSearchParametersData = Data<typeof ListSalesSearchParametersSchema>;

@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class ListSalesSearchParametersInteractor extends AuthenticatedInteractor<
  ListSalesSearchParametersData,
  SalesSearchParameterPage
> {
  constructor(
    private accountRepo: FindUsableAccountRepo,
    private messagingService: MessagingService,
  ) {
    super();
  }

  @Validate(ListSalesSearchParametersSchema)
  @ValidateOutput(SalesSearchParameterPageSchema)
  async invoke(data: ListSalesSearchParametersData): Validated<SalesSearchParameterPage> {
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
