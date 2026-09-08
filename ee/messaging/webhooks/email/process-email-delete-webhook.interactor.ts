import { z } from "zod";

import { ConnectedAccountStatus } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import type { ConnectedAccount } from "@/generated/prisma";
import type { FindAccountByUnipileIdUnscopedRepo } from "../../persistence/find-account-by-unipile-id-unscoped.repo";
import type { MessagingIngestRepo } from "../../ingest/messaging-ingest.repo";
import type { MessagingService } from "../../messaging.service";
import type { WebhookEventRepo } from "../webhook-event.repo";
import type { EventService } from "@/features/event/event.service";
import type { EmailFolder } from "../../email-folders";
import type { UnipileEmail } from "../../unipile.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { getUnipileStatus } from "../../messaging.service";
import { EmailFolderSchema, isSkippedEmailFolder } from "../../email-folders";
import { UnipileEmailSchema } from "../../unipile.schema";
import { DeferredWebhookError } from "@/core/errors/app-errors";

const Schema = z.object({
  type: z.literal("email.delete"),
  account_id: z.string(),
  payload: z.looseObject({
    email: z.looseObject({ id: z.string() }),
    folder_id: z.string().nullish(),
  }),
});
type Payload = z.infer<typeof Schema>;

const BURST_WINDOW_MS = 60_000;
const BURST_LIMIT = 10;
const SEARCH_WINDOW_MS = 1_000;
const RELOCATION_GRACE_MS = 8_000;
const SEARCH_LIMIT = 25;

type Candidate = { email: UnipileEmail; folderIds: string[] };

type Relocation =
  | { status: "relocated"; email: UnipileEmail; folderIds: string[] }
  | { status: "absent" }
  | { status: "unsearchable" };

function parseEmails(data: unknown[] | null | undefined): UnipileEmail[] {
  return (data ?? []).flatMap((raw) => {
    const parsed = UnipileEmailSchema.safeParse(raw);
    return parsed.success ? [parsed.data] : [];
  });
}

function parseFolderCatalog(folders: unknown): EmailFolder[] {
  const parsed = z.array(EmailFolderSchema).safeParse(folders);
  return parsed.success ? parsed.data : [];
}

@SystemInteractor
export class ProcessEmailDeleteWebhookInteractor {
  constructor(
    private ingest: MessagingIngestRepo,
    private accountRepo: FindAccountByUnipileIdUnscopedRepo,
    private eventService: EventService,
    private messagingService: MessagingService,
    private events: WebhookEventRepo,
  ) {}

  @Enforce(Schema)
  async invoke(envelope: Payload): Promise<void> {
    const account = await this.accountRepo.findAccountByUnipileIdUnscoped(envelope.account_id);
    if (!account || account.status === ConnectedAccountStatus.deleted) return;

    const existing = await this.ingest.findMessageByUnipileIdUnscoped({
      connectedAccountId: account.id,
      unipileMessageId: envelope.payload.email.id,
    });
    if (!existing) return;

    const burst = await this.isDeleteBurst(account);
    if (burst) {
      await this.waitForRelocation();

      const stillPresent = await this.ingest.findMessageByUnipileIdUnscoped({
        connectedAccountId: account.id,
        unipileMessageId: envelope.payload.email.id,
      });
      if (!stillPresent) return;
    }

    const relocation = await this.findRelocation(
      account,
      existing.providerMessageId ?? null,
      existing.sentAt,
      envelope,
      burst,
    );
    if (relocation.status === "relocated") {
      await this.ingest.moveEmailMessageUnscoped({
        companyId: account.companyId,
        connectedAccountId: account.id,
        unipileMessageId: envelope.payload.email.id,
        newUnipileMessageId: relocation.email.id,
        folderIds: relocation.folderIds,
      });

      return;
    }

    if (relocation.status === "unsearchable")
      throw new DeferredWebhookError("relocation cannot be verified during a delete burst");

    const deleted = await this.ingest.deleteMessageUnscoped({
      companyId: account.companyId,
      connectedAccountId: account.id,
      unipileMessageId: envelope.payload.email.id,
    });
    if (!deleted) return;

    await this.eventService.publish(
      DomainEvent.MESSAGING_EMAIL_DELETED,
      {
        entityId: deleted.id,
        payload: {
          connectedAccountId: account.id,
          provider: account.provider,
          providerMessageId: envelope.payload.email.id,
          threadId: deleted.messagingThreadId,
        },
      },
      { systemCompanyId: account.companyId },
    );
  }

  private async isDeleteBurst(account: ConnectedAccount): Promise<boolean> {
    const recentDeletes = await this.events.countRecentEmailDeletesUnscoped({
      unipileAccountId: account.unipileAccountId,
      since: new Date(Date.now() - BURST_WINDOW_MS),
    });

    return recentDeletes > BURST_LIMIT;
  }

  private waitForRelocation(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, RELOCATION_GRACE_MS));
  }

  private async findRelocation(
    account: ConnectedAccount,
    providerMessageId: string | null,
    sentAt: Date,
    envelope: Payload,
    burst: boolean,
  ): Promise<Relocation> {
    if (!providerMessageId) return { status: "absent" };

    const folders = parseFolderCatalog(account.folders);
    const originFolderId = envelope.payload.folder_id ?? null;
    const candidates = await this.listCandidates(account.unipileAccountId, sentAt, folders, originFolderId, burst);
    if (!candidates) return { status: "unsearchable" };

    const catalogById = new Map(folders.map((folder) => [folder.id, folder]));

    for (const candidate of candidates) {
      if (candidate.email.message_id?.trim() !== providerMessageId) continue;

      const remainingFolderIds = candidate.folderIds.filter((id) => id !== originFolderId);
      const visibleFolderIds = remainingFolderIds.filter((id) => {
        const folder = catalogById.get(id);
        return !folder || !isSkippedEmailFolder(folder);
      });
      if (visibleFolderIds.length === 0) return { status: "absent" };

      return { status: "relocated", email: candidate.email, folderIds: remainingFolderIds };
    }

    return { status: "absent" };
  }

  private async listCandidates(
    unipileAccountId: string,
    sentAt: Date,
    folders: EmailFolder[],
    originFolderId: string | null,
    burst: boolean,
  ): Promise<Candidate[] | null> {
    const after = new Date(sentAt.getTime() - SEARCH_WINDOW_MS).toISOString();
    const before = new Date(sentAt.getTime() + SEARCH_WINDOW_MS).toISOString();

    try {
      const page = await this.messagingService.listEmails({
        accountId: unipileAccountId,
        after,
        before,
        metaOnly: true,
        limit: SEARCH_LIMIT,
      });

      return parseEmails(page.data).map((email) => ({ email, folderIds: email.folders ?? [] }));
    } catch (err) {
      if (getUnipileStatus(err) !== 501) throw err;
    }

    if (burst) return null;

    const candidates: Candidate[] = [];
    for (const folder of folders) {
      if (folder.id === originFolderId || isSkippedEmailFolder(folder)) continue;

      const page = await this.messagingService.listFolderEmails({
        accountId: unipileAccountId,
        folderId: folder.id,
        after,
        before,
        metaOnly: true,
        limit: SEARCH_LIMIT,
      });
      for (const email of parseEmails(page.data)) candidates.push({ email, folderIds: email.folders ?? [folder.id] });
    }

    return candidates;
  }
}
