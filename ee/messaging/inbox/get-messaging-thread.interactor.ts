import type { MessagingMessage, MessagingThread } from "../messaging.schema";
import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { Resource, Action } from "@/generated/prisma";

import { MessagingThreadSchema } from "../messaging.schema";
import { MessagingMessageDtoSchema } from "./inbox.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

const AccountOwnerDtoSchema = z.object({
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
});
export type AccountOwnerDto = z.infer<typeof AccountOwnerDtoSchema>;

const Schema = z.object({ threadId: z.uuid() });
type GetMessagingThreadData = Data<typeof Schema>;

const ResultSchema = z.object({
  thread: MessagingThreadSchema,
  messages: z.array(MessagingMessageDtoSchema),
  accountOwners: z.record(z.string(), AccountOwnerDtoSchema),
});
type GetMessagingThreadResult = z.infer<typeof ResultSchema>;

export abstract class GetMessagingThreadRepo {
  abstract findThreadByIdOrThrow(id: string): Promise<MessagingThread>;
  abstract listMessagesForThread(threadId: string): Promise<MessagingMessage[]>;
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
  ) {
    super();
  }

  @Enforce(Schema)
  @ValidateOutput(ResultSchema)
  async invoke(data: GetMessagingThreadData): Promise<{ ok: true; data: GetMessagingThreadResult }> {
    const thread = await this.repo.findThreadByIdOrThrow(data.threadId);

    const rawMessages = await this.repo.listMessagesForThread(thread.id);
    const messages = rawMessages.map((message) => ({
      ...message,
      attachmentsMeta: message.attachmentsMeta.map((attachment) => ({
        ...attachment,
        linkUrl: attachment.type === "linkedin_post" ? (attachment.url ?? null) : null,
      })),
    }));
    const accountOwners = await this.accountRepo.listAccountOwnersByIds([thread.connectedAccountId]);

    return { ok: true as const, data: { thread, messages, accountOwners } };
  }
}
