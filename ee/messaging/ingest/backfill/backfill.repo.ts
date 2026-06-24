import type { ConnectedAccount, ConnectedAccountStatus } from "@/generated/prisma";
import type { BackfillCheckpoint } from "./backfill-checkpoint.schema";

export abstract class BackfillConnectedAccountRepo {
  abstract recordUnusableItemUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    payload: unknown;
    unipileMessageId?: string | null;
  }): Promise<void>;
  abstract findAccountByIdOrThrowUnscoped(id: string): Promise<ConnectedAccount>;
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
  }): Promise<ConnectedAccount | null>;
  abstract loadBackfillCheckpointUnscoped(
    unipileAccountId: string,
  ): Promise<{ checkpoint: BackfillCheckpoint; epoch: number }>;
  abstract saveBackfillStepCheckpointUnscoped(args: {
    unipileAccountId: string;
    step: keyof BackfillCheckpoint;
    checkpoint: NonNullable<BackfillCheckpoint[keyof BackfillCheckpoint]>;
    epoch: number;
  }): Promise<void>;
  abstract refreshBackfillClaimUnscoped(unipileAccountId: string, token: string): Promise<boolean>;
  abstract releaseBackfillClaimUnscoped(unipileAccountId: string, token: string): Promise<void>;
  abstract finalizeBackfillUnscoped(args: { unipileAccountId: string; epoch: number; token: string }): Promise<boolean>;
  abstract markAccountHasCalendarUnscoped(unipileAccountId: string): Promise<void>;
  abstract setAccountOwnAttendeeIdUnscoped(args: {
    unipileAccountId: string;
    ownUnipileAttendeeId: string;
  }): Promise<void>;
}
