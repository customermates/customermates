import type { ExtendedUser } from "@/features/user/user.types";

import type {
  ConnectedAccount,
  ConnectedAccountStatus as ConnectedAccountStatusType,
  MessagingProvider,
} from "@/generated/prisma";

import type { EmailFolder } from "../../email-folders";

import { FindAccountByUnipileIdUnscopedRepo } from "../../persistence/find-account-by-unipile-id-unscoped.repo";

export abstract class WebhookUserRepo {
  abstract findExtendedUserByIdOrThrowUnscoped(userId: string): Promise<ExtendedUser>;
}

export abstract class AccountWebhookRepo extends FindAccountByUnipileIdUnscopedRepo {
  abstract createAccountUnscoped(args: {
    companyId: string;
    userId: string;
    unipileAccountId: string;
    provider: MessagingProvider;
    status: ConnectedAccountStatusType;
    displayName: string | null;
    emailAddress: string | null;
    hasMessaging: boolean;
    hasCalendar: boolean;
  }): Promise<ConnectedAccount>;
  abstract updateAccountUnscoped(args: {
    unipileAccountId: string;
    status?: ConnectedAccountStatusType;
    displayName?: string | null;
    emailAddress?: string | null;
    provider?: MessagingProvider;
    syncing?: boolean;
    hasMessaging?: boolean;
    hasCalendar?: boolean;
    sentFolderIds?: string[];
    folders?: EmailFolder[];
    foldersSyncedAt?: Date;
    selectedFolderIds?: string[];
  }): Promise<ConnectedAccount | null>;
}
