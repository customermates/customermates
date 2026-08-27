import { CustomErrorCode } from "@/core/validation/validation.types";
import { fail } from "@/core/validation/interactor-failure-server";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import type { MessagingService } from "../messaging.service";
import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";
import type { RelationRequestResult } from "./social-posts.schema";

import { z } from "zod";
import { getLocale } from "next-intl/server";

import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { isSocialProvider } from "../provider";
import { formatRetryAfter } from "../retry-after";
import { RelationRequestResultSchema } from "./social-posts.schema";

export const CreateRelationRequestSchema = z.object({
  connectedAccountId: z.uuid(),
  identifier: z.string().min(1),
  message: z.string().max(300).optional(),
});
type CreateRelationRequestData = Data<typeof CreateRelationRequestSchema>;

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.create })
export class CreateRelationRequestInteractor extends AuthenticatedInteractor<
  CreateRelationRequestData,
  RelationRequestResult
> {
  constructor(
    private accountRepo: FindUsableAccountRepo,
    private messagingService: MessagingService,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Write({ input: CreateRelationRequestSchema, output: RelationRequestResultSchema, tx: false })
  async invoke(data: CreateRelationRequestData): Validated<RelationRequestResult> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const account = await this.accountRepo.findUsableAccountByIdOrThrow(data.connectedAccountId);

    if (!isSocialProvider(account.provider))
      return fail(CustomErrorCode.socialActionRequiresSocialAccount, [], { provider: account.provider });

    const res = await this.messagingService.createRelationRequest({
      accountId: account.unipileAccountId,
      userId: data.identifier,
      message: data.message,
    });
    if (!res.ok) return fail(res.error, [], { retryAfter: formatRetryAfter(await getLocale(), res.retryAfterSeconds) });

    return { ok: true as const, data: res.data };
  }
}
