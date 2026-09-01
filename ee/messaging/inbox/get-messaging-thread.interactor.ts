import { failNotFound } from "@/core/validation/interactor-failure-server";
import type { MessagingMessage, MessagingThread } from "../messaging.schema";
import type { EmailFolder } from "../email-folders";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";

import { CustomErrorCode } from "@/core/validation/validation.types";

import { Resource, Action } from "@/generated/prisma";

import { MessagingThreadSchema } from "../messaging.schema";
import { MessagingMessageDtoSchema, toMessagingMessageDto } from "./inbox.schema";
import { EmailFolderSchema, threadEmailFolderIds } from "../email-folders";
import { isEmailProvider } from "../provider";

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

const ThreadFolderContextSchema = z.object({
  folders: z.array(EmailFolderSchema),
  selectedFolderIds: z.array(z.string()),
  currentFolderIds: z.array(z.string()),
});
export type ThreadFolderContext = z.infer<typeof ThreadFolderContextSchema>;

export const GetMessagingThreadResultSchema = z.object({
  thread: MessagingThreadSchema,
  messages: z.array(MessagingMessageDtoSchema),
  total: z.number().int(),
  accountOwners: z.record(z.string(), AccountOwnerDtoSchema),
  folderContext: ThreadFolderContextSchema.nullable(),
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
  abstract findFolderContextById(
    accountId: string,
  ): Promise<{ folders: EmailFolder[]; selectedFolderIds: string[] } | null>;
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
    if (!thread) return failNotFound(CustomErrorCode.threadNotFound, ["threadId"]);

    const { messages: rawMessages, total } = await this.repo.listMessagesForThread(thread.id, {
      page: data.page,
      pageSize: data.pageSize,
    });

    const messages = rawMessages.map(toMessagingMessageDto);
    const accountOwners = await this.accountRepo.listAccountOwnersByIds([thread.connectedAccountId]);
    const folderContext = await this.resolveFolderContext(thread, rawMessages);

    return {
      ok: true as const,
      data: { thread, messages, total, accountOwners, folderContext },
    };
  }

  private async resolveFolderContext(
    thread: MessagingThread,
    messages: MessagingMessage[],
  ): Promise<ThreadFolderContext | null> {
    if (!isEmailProvider(thread.provider)) return null;

    const context = await this.accountRepo.findFolderContextById(thread.connectedAccountId);
    if (!context) return null;

    return { ...context, currentFolderIds: threadEmailFolderIds(messages, context.folders) };
  }
}
