import type { ConnectedAccount } from "@/generated/prisma";

export abstract class FindUsableAccountRepo {
  abstract findUsableAccountByIdOrThrow(connectedAccountId: string): Promise<ConnectedAccount>;
}
