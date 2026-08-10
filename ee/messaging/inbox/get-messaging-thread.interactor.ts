import type { MessagingMessage, MessagingThread } from "../messaging.schema";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { getTranslations } from "next-intl/server";

import { createZodError } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { Resource, Action } from "@/generated/prisma";

import { MessagingThreadSchema } from "../messaging.schema";
import { MessagingMessageDtoSchema, toMessagingMessageDto } from "./inbox.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

const AccountOwnerDtoSchema = z.object({
  displayName: z.string().nullable(),
  accountLabel: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});
export type AccountOwnerDto = z.infer<typeof AccountOwnerDtoSchema>;

const Schema = z.object({
  threadId: z.uuid(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});
type GetMessagingThreadData = Data<typeof Schema>;

export const GetMessagingThreadResultSchema = z.object({
  thread: MessagingThreadSchema,
  messages: z.array(MessagingMessageDtoSchema),
  total: z.number().int(),
  accountOwners: z.record(z.string(), AccountOwnerDtoSchema),
});
type GetMessagingThreadResult = z.infer<typeof GetMessagingThreadResultSchema>;

export abstract class GetMessagingThreadRepo {
  abstract findThreadById(id: string): Promise<MessagingThread | null>;
  abstract listMessagesForThread(
    threadId: string,
    opts?: { page?: number; pageSize?: number },
  ): Promise<{ messages: MessagingMessage[]; total: number }>;
}

export abstract class ThreadAccountOwnersRepo {
  abstract listAccountOwnersByIds(accountIds: string[]): Promise<Record<string, AccountOwnerDto>>;
}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetMessagingThreadInteractor extends AuthenticatedInteractor<
  GetMessagingThreadData,
  GetMessagingThreadResult
> {
  constructor(
    private repo: GetMessagingThreadRepo,
    private accountRepo: ThreadAccountOwnersRepo,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(GetMessagingThreadResultSchema)
  async invoke(data: GetMessagingThreadData): Validated<GetMessagingThreadResult> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const thread = await this.repo.findThreadById(data.threadId);
    if (!thread) {
      const t = await getTranslations();
      return {
        ok: false as const,
        error: createZodError(t("Common.errors.threadNotFound"), [], { error: CustomErrorCode.threadNotFound }),
      };
    }

    const { messages: rawMessages, total } = await this.repo.listMessagesForThread(thread.id, {
      page: data.page,
      pageSize: data.pageSize,
    });

    const messages = rawMessages.map(toMessagingMessageDto);
    const accountOwners = await this.accountRepo.listAccountOwnersByIds([thread.connectedAccountId]);

    return {
      ok: true as const,
      data: { thread, messages, total, accountOwners },
    };
  }
}
