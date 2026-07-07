import type { Data, Validated } from "@/core/validation/validation.utils";

import type { MessagingService } from "../messaging.service";
import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";
import type { RelationRequestResult } from "./social-posts.schema";

import { z } from "zod";
import { getLocale, getTranslations } from "next-intl/server";

import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { createZodError } from "@/core/validation/validation.utils";
import { isSocialProvider } from "../provider";
import { formatRetryAfter } from "../retry-after";
import { RelationRequestResultSchema } from "./social-posts.schema";

export const CancelRelationRequestSchema = z.object({
  connectedAccountId: z.uuid(),
  invitationId: z.string().min(1),
});
type CancelRelationRequestData = Data<typeof CancelRelationRequestSchema>;

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.update })
export class CancelRelationRequestInteractor extends AuthenticatedInteractor<
  CancelRelationRequestData,
  RelationRequestResult
> {
  constructor(
    private accountRepo: FindUsableAccountRepo,
    private messagingService: MessagingService,
  ) {
    super();
  }

  @Write({ input: CancelRelationRequestSchema, output: RelationRequestResultSchema, tx: false })
  async invoke(data: CancelRelationRequestData): Validated<RelationRequestResult> {
    const account = await this.accountRepo.findUsableAccountByIdOrThrow(data.connectedAccountId);

    if (!isSocialProvider(account.provider)) {
      const t = await getTranslations();
      return {
        ok: false,
        error: createZodError<RelationRequestResult>(
          t("Common.errors.socialActionRequiresSocialAccount", { provider: account.provider }),
        ),
      };
    }

    const res = await this.messagingService.cancelRelationRequest({
      accountId: account.unipileAccountId,
      invitationId: data.invitationId,
    });
    if (!res.ok) {
      const t = await getTranslations();
      return {
        ok: false,
        error: createZodError<RelationRequestResult>(
          t(`Common.errors.${res.error}`, { retryAfter: formatRetryAfter(await getLocale(), res.retryAfterSeconds) }),
        ),
      };
    }

    return { ok: true as const, data: res.data };
  }
}
