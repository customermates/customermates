import type { ConnectedAccount } from "../messaging.schema";

export abstract class FindAccountByUnipileIdUnscopedRepo {
  abstract findAccountByUnipileIdUnscoped(unipileAccountId: string): Promise<ConnectedAccount | null>;
  abstract findAccountByUnipileIdOrThrowUnscoped(unipileAccountId: string): Promise<ConnectedAccount>;
}
