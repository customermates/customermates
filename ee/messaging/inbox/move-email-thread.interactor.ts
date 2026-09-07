import type { MessagingService } from "../messaging.service";
import type { EmailFolder } from "../email-folders";
import type { MessagingProvider } from "@/generated/prisma";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import * as Sentry from "@sentry/node";
import { getLocale } from "next-intl/server";

import { Action, Resource } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { fail, failNotFound } from "@/core/validation/interactor-failure-server";

import { isFileableEmailProvider } from "../provider";
import { isEmailMoveTarget, isMovableEmailFolder } from "../email-folders";
import { formatRetryAfter } from "../retry-after";

export const MoveEmailThreadSchema = z.object({
  threadId: z.uuid().describe("Email thread id from get_messaging_threads.items[].id"),
  folderId: z
    .string()
    .min(1)
    .describe("Target folder id from get_messaging_threads thread.folder.moveTargets[].id. Never a folder name"),
});
export type MoveEmailThreadData = Data<typeof MoveEmailThreadSchema>;

export const MoveEmailThreadResultSchema = z.object({
  threadId: z.string(),
  folderId: z.string(),
  folderName: z.string(),
  movedCount: z.number(),
  skippedCount: z.number(),
  failedCount: z.number(),
  hiddenFromInbox: z.boolean(),
  rateLimited: z.boolean(),
  retryAfter: z.string().optional(),
});
export type MoveEmailThreadResult = Data<typeof MoveEmailThreadResultSchema>;

type MoveThread = {
  id: string;
  connectedAccountId: string;
  provider: MessagingProvider;
  companyId: string;
  unipileAccountId: string;
};

type MovableMessage = {
  id: string;
  unipileMessageId: string;
  folderIds: string[];
};

export abstract class MoveEmailThreadAccountRepo {
  abstract findFolderContextById(
    accountId: string,
  ): Promise<{ folders: EmailFolder[]; selectedFolderIds: string[] } | null>;
}

export abstract class MoveEmailThreadRepo {
  abstract findThreadForMoveOrThrow(threadId: string): Promise<MoveThread>;
  abstract listThreadMovableMessages(threadId: string): Promise<MovableMessage[]>;
  abstract moveEmailMessageUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    unipileMessageId: string;
    newUnipileMessageId: string;
    folderIds: string[];
  }): Promise<{ id: string } | null>;
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.update })
export class MoveEmailThreadInteractor extends AuthenticatedInteractor<MoveEmailThreadData, MoveEmailThreadResult> {
  constructor(
    private repo: MoveEmailThreadRepo,
    private accountRepo: MoveEmailThreadAccountRepo,
    private messagingService: MessagingService,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(MoveEmailThreadSchema)
  @ValidateOutput(MoveEmailThreadResultSchema)
  async invoke(data: MoveEmailThreadData): Validated<MoveEmailThreadResult> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const thread = await this.repo.findThreadForMoveOrThrow(data.threadId);
    if (!isFileableEmailProvider(thread.provider))
      return fail(CustomErrorCode.emailFolderMoveUnsupported, ["threadId"]);

    const context = await this.accountRepo.findFolderContextById(thread.connectedAccountId);
    if (!context) return failNotFound(CustomErrorCode.emailFolderNotFound, ["folderId"]);

    const target = context.folders.find((folder) => folder.id === data.folderId);
    if (!target) return failNotFound(CustomErrorCode.emailFolderNotFound, ["folderId"]);
    if (!isEmailMoveTarget(target)) return fail(CustomErrorCode.emailFolderNotMovable, ["folderId"]);

    const keptFolderIds = new Set(
      context.folders.filter((entry) => !isMovableEmailFolder(entry)).map((entry) => entry.id),
    );
    const messages = await this.repo.listThreadMovableMessages(data.threadId);
    const pending = messages.filter(
      (message) =>
        message.folderIds.length > 0 &&
        !message.folderIds.includes(target.id) &&
        !message.folderIds.some((id) => keptFolderIds.has(id)),
    );

    let movedCount = 0;
    let failedCount = 0;
    let rateLimited = false;
    let retryAfter: string | undefined;

    for (const message of pending) {
      const moved = await this.messagingService.moveEmail({
        accountId: thread.unipileAccountId,
        emailId: message.unipileMessageId,
        folderId: target.id,
      });

      if (!moved.ok) {
        if (movedCount === 0 && failedCount === 0) {
          return fail(moved.error, [], {
            retryAfter: formatRetryAfter(await getLocale(), moved.retryAfterSeconds),
          });
        }

        failedCount += 1;

        if (moved.error === CustomErrorCode.unipileRateLimit) {
          rateLimited = true;
          retryAfter = formatRetryAfter(await getLocale(), moved.retryAfterSeconds);
          break;
        }

        continue;
      }

      let applied: { id: string } | null = null;
      try {
        applied = await this.repo.moveEmailMessageUnscoped({
          companyId: thread.companyId,
          connectedAccountId: thread.connectedAccountId,
          unipileMessageId: message.unipileMessageId,
          newUnipileMessageId: moved.data.id,
          folderIds: moved.data.folderIds,
        });
      } catch (err) {
        Sentry.captureException(err, {
          tags: {
            unipileAccountId: thread.unipileAccountId,
            companyId: thread.companyId,
            connectedAccountId: thread.connectedAccountId,
          },
        });
      }

      if (applied) movedCount += 1;
      else failedCount += 1;
    }

    return {
      ok: true as const,
      data: {
        threadId: thread.id,
        folderId: target.id,
        folderName: target.name ?? target.id,
        movedCount,
        skippedCount: messages.length - pending.length,
        failedCount,
        rateLimited,
        ...(retryAfter ? { retryAfter } : {}),
        hiddenFromInbox: movedCount > 0 && !context.selectedFolderIds.includes(target.id),
      },
    };
  }
}
