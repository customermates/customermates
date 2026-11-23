import type { ConnectedAccount } from "@/generated/prisma";

export abstract class DeleteAccountForBillingRepo {
  abstract findAccountByIdOrThrowUnscoped(id: string): Promise<ConnectedAccount>;
  abstract markAccountDeletedUnscoped(id: string): Promise<void>;
  abstract countOtherLiveAccountsForUnipileIdUnscoped(unipileAccountId: string, exceptId: string): Promise<number>;
}
