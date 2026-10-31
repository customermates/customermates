import type { ConnectedAccount, ConnectedAccountStatus } from "@/generated/prisma";
import type { EmailFolder } from "../../email-folders";

export type EmailFolderPass = { companyId: string; connectedAccountId: string; folderId: string };

export abstract class BackfillConnectedAccountRepo {
  abstract recordUnusableItemUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    payload: unknown;
    unipileMessageId?: string | null;
  }): Promise<void>;
  abstract findAccountByIdUnscoped(id: string): Promise<ConnectedAccount | null>;
  abstract updateAccountUnscoped(args: {
    unipileAccountId: string;
    status?: ConnectedAccountStatus;
    lastSyncedAt?: Date;
    syncing?: boolean;
    hasMessaging?: boolean;
    hasCalendar?: boolean;
    displayName?: string | null;
    emailAddress?: string | null;
    sentFolderIds?: string[];
    folders?: EmailFolder[];
    foldersSyncedAt?: Date;
    selectedFolderIds?: string[];
    linkedinProducts?: string[];
  }): Promise<ConnectedAccount | null>;
  abstract markAccountHasCalendarUnscoped(unipileAccountId: string): Promise<void>;
  abstract clearEmailFolderPassUnscoped(args: EmailFolderPass): Promise<void>;
  abstract recordEmailFolderPassSeenUnscoped(args: EmailFolderPass & { unipileMessageIds: string[] }): Promise<void>;
  abstract listEmailFolderPassSeenUnscoped(args: EmailFolderPass): Promise<string[]>;
}
