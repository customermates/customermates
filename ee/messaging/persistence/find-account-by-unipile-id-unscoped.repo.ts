import type { ConnectedAccount } from "@/generated/prisma";

export abstract class FindAccountByUnipileIdUnscopedRepo {
  abstract findAccountByUnipileIdUnscoped(unipileAccountId: string): Promise<ConnectedAccount | null>;
  abstract findAccountByUnipileIdOrThrowUnscoped(unipileAccountId: string): Promise<ConnectedAccount>;
}
