import type { ConnectedAccount } from "../../messaging.schema";
import type { BackfillCheckpoint } from "./backfill-checkpoint.schema";

export abstract class BackfillConnectedAccountRepo {
  abstract recordUnusableItem(args: {
    companyId: string;
    connectedAccountId: string;
    payload: unknown;
    unipileMessageId?: string | null;
  }): Promise<void>;
  abstract findAccountByIdOrThrowUnscoped(id: string): Promise<ConnectedAccount>;
  abstract updateAccount(args: {
    unipileAccountId: string;
    lastSyncedAt?: Date;
    syncing?: boolean;
    hasMessaging?: boolean;
    hasCalendar?: boolean;
    displayName?: string | null;
    emailAddress?: string | null;
  }): Promise<ConnectedAccount | null>;
  abstract loadBackfillCheckpoint(unipileAccountId: string): Promise<{ checkpoint: BackfillCheckpoint; epoch: number }>;
  abstract saveBackfillStepCheckpoint(args: {
    unipileAccountId: string;
    step: keyof BackfillCheckpoint;
    checkpoint: NonNullable<BackfillCheckpoint[keyof BackfillCheckpoint]>;
    epoch: number;
  }): Promise<void>;
  abstract refreshBackfillClaim(unipileAccountId: string, token: string): Promise<boolean>;
  abstract releaseBackfillClaim(unipileAccountId: string, token: string): Promise<void>;
  abstract finalizeBackfill(args: { unipileAccountId: string; epoch: number; token: string }): Promise<boolean>;
  abstract markAccountHasCalendar(unipileAccountId: string): Promise<void>;
  abstract setAccountOwnAttendeeId(args: { unipileAccountId: string; ownUnipileAttendeeId: string }): Promise<void>;
}
