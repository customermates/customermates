import type { Data, Validated } from "@/core/validation/validation.utils";

import type { MessagingService } from "../messaging.service";
import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";
import type { SaveToSalesListResult } from "./sales-navigator.schema";

import { z } from "zod";
import { getLocale, getTranslations } from "next-intl/server";

import { Resource, Action, MessagingProvider } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { createZodError } from "@/core/validation/validation.utils";
import { formatRetryAfter } from "../retry-after";
import { SalesListKindSchema, SaveToSalesListResultSchema } from "./sales-navigator.schema";

export const SaveToSalesListSchema = z.object({
  connectedAccountId: z.uuid(),
  kind: SalesListKindSchema.default("leads"),
  listId: z.string().min(1),
  providerId: z.string().min(1),
});
type SaveToSalesListData = Data<typeof SaveToSalesListSchema>;

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.create })
export class SaveToSalesListInteractor extends AuthenticatedInteractor<SaveToSalesListData, SaveToSalesListResult> {
  constructor(
    private accountRepo: FindUsableAccountRepo,
    private messagingService: MessagingService,
  ) {
    super();
  }

  @Write({ input: SaveToSalesListSchema, output: SaveToSalesListResultSchema, tx: false })
  async invoke(data: SaveToSalesListData): Validated<SaveToSalesListResult> {
    const account = await this.accountRepo.findUsableAccountByIdOrThrow(data.connectedAccountId);

    if (account.provider !== MessagingProvider.linkedin) {
      const t = await getTranslations();
      return {
        ok: false,
        error: createZodError<SaveToSalesListResult>(
          t("Common.errors.salesNavigatorRequiresLinkedin", { provider: account.provider }),
        ),
      };
    }

    const res = await this.messagingService.saveToSalesList({
      accountId: account.unipileAccountId,
      kind: data.kind,
      listId: data.listId,
      providerId: data.providerId,
    });
    if (!res.ok) {
      const t = await getTranslations();
      return {
        ok: false,
        error: createZodError<SaveToSalesListResult>(
          t(`Common.errors.${res.error}`, { retryAfter: formatRetryAfter(await getLocale(), res.retryAfterSeconds) }),
        ),
      };
    }

    return { ok: true as const, data: res.data };
  }
}
