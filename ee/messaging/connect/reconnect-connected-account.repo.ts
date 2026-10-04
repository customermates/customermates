import type { ConnectedAccount } from "@/generated/prisma";

export abstract class ReconnectConnectedAccountRepo {
  abstract findAccountByIdOrThrow(id: string): Promise<ConnectedAccount>;
}
