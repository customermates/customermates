import type { ConnectedAccount } from "../messaging.schema";

export abstract class FindUsableAccountRepo {
  abstract findUsableAccountByIdOrThrow(connectedAccountId: string): Promise<ConnectedAccount>;
}
