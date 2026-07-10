import { z } from "zod";

import { ConnectedAccountStatus } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import type { MessagingService } from "../../messaging.service";
import type { AccountWebhookRepo } from "../account/account-webhook.repo";

import { buildFolderCatalog, defaultSelectedFolderIds, isSentEmailFolder } from "../../email-folders";
import { UnipileFolderSchema } from "../../unipile.schema";

const Schema = z.object({
  type: z.enum(["email.folder.create", "email.folder.update", "email.folder.delete"]),
  account_id: z.string(),
});
type Payload = z.infer<typeof Schema>;

@SystemInteractor
export class ProcessEmailFolderWebhookInteractor {
  constructor(
    private accountRepo: AccountWebhookRepo,
    private messagingService: MessagingService,
  ) {}

  @Enforce(Schema)
  async invoke(envelope: Payload): Promise<void> {
    const account = await this.accountRepo.findAccountByUnipileIdOrThrowUnscoped(envelope.account_id);
    if (account.status === ConnectedAccountStatus.deleted) return;

    const page = await this.messagingService.listFolders({ accountId: account.unipileAccountId });
    const folders = (page.data ?? []).flatMap((raw) => {
      const parsed = UnipileFolderSchema.safeParse(raw);
      return parsed.success ? [parsed.data] : [];
    });
    if (folders.length === 0) return;

    const sentFolderIds = folders.filter(isSentEmailFolder).map((folder) => folder.id);

    await this.accountRepo.updateAccountUnscoped({
      unipileAccountId: account.unipileAccountId,
      folders: buildFolderCatalog(folders),
      foldersSyncedAt: new Date(),
      ...(sentFolderIds.length > 0 ? { sentFolderIds } : {}),
      ...(account.foldersSyncedAt === null ? { selectedFolderIds: defaultSelectedFolderIds(folders) } : {}),
    });
  }
}
