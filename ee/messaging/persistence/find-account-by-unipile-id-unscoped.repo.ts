import type { ConnectedAccount } from "@/generated/prisma";

export abstract class FindAccountByUnipileIdUnscopedRepo {
  abstract findAccountByUnipileIdUnscoped(
    unipileAccountId: string,
    connectedAccountId?: string,
  ): Promise<ConnectedAccount | null>;
  abstract markAccountHasCalendarUnscoped(unipileAccountId: string): Promise<void>;
}
