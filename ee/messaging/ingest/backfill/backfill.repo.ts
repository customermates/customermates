import type { ConnectedAccount, ConnectedAccountStatus } from "@/generated/prisma";
import type { EmailFolder } from "../../email-folders";

export abstract class BackfillConnectedAccountRepo {
  abstract recordUnusableItemUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    payload: unknown;
    unipileMessageId?: string | null;
  }): Promise<void>;
  abstract recordRawBackfillItemUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    accountId: string;
    itemType: "chat" | "email";
    payload: unknown;
    unipileMessageId?: string | null;
  }): Promise<void>;
  abstract findAccountByIdUnscoped(id: string): Promise<ConnectedAccount | null>;
  abstract updateAccountUnscoped(args: {
    unipileAccountId: string;
    status?: ConnectedAccountStatus;
    lastSyncedAt?: Date;
    syncing?: boolean;
    providerSyncing?: boolean;
    hasMessaging?: boolean;
    hasCalendar?: boolean;
    displayName?: string | null;
    emailAddress?: string | null;
    sentFolderIds?: string[];
    folders?: EmailFolder[];
    foldersSyncedAt?: Date;
    selectedFolderIds?: string[];
  }): Promise<ConnectedAccount | null>;
  abstract markAccountHasCalendarUnscoped(unipileAccountId: string): Promise<void>;
}
