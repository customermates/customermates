import type { ConnectedAccount } from "@/generated/prisma";

export abstract class DeleteConnectedAccountRepo {
  abstract findAccountByIdOrThrow(id: string): Promise<ConnectedAccount>;
  abstract deleteAccount(id: string): Promise<void>;
}
