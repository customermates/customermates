import type { ConnectedAccountStatus, MessagingProvider, Prisma } from "@/generated/prisma";

import type { AccountConnectionDetails } from "../account-connection.schema";
import type { EmailFolder } from "../email-folders";

export type AccountUpdate = {
  unipileAccountId: string;
  connectedAccountId?: string;
  status?: ConnectedAccountStatus;
  connectionDetails?: AccountConnectionDetails;
  statusCheckedAt?: Date;
  displayName?: string | null;
  emailAddress?: string | null;
  lastSyncedAt?: Date;
  provider?: MessagingProvider;
  syncing?: boolean;
  ownerAvatarUrl?: string | null;
  hasMessaging?: boolean;
  hasCalendar?: boolean;
  sentFolderIds?: string[];
  folders?: EmailFolder[];
  foldersSyncedAt?: Date;
  selectedFolderIds?: string[];
  linkedinProducts?: string[];
};

export function sharedAccountUpdateData(args: AccountUpdate): Prisma.ConnectedAccountUpdateInput {
  return {
    status: args.status,
    connectionDetails: args.connectionDetails,
    statusCheckedAt: args.statusCheckedAt,
    displayName: args.displayName,
    emailAddress: args.emailAddress,
    provider: args.provider,
    ownerAvatarUrl: args.ownerAvatarUrl,
    hasMessaging: args.hasMessaging,
    hasCalendar: args.hasCalendar,
    linkedinProducts: args.linkedinProducts,
  };
}

export function accountUpdateData(args: AccountUpdate): Prisma.ConnectedAccountUpdateInput {
  return {
    ...sharedAccountUpdateData(args),
    lastSyncedAt: args.lastSyncedAt,
    syncing: args.syncing,
    sentFolderIds: args.sentFolderIds,
    folders: args.folders as Prisma.InputJsonValue | undefined,
    foldersSyncedAt: args.foldersSyncedAt,
    selectedFolderIds: args.selectedFolderIds,
  };
}
