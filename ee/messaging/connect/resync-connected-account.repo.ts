import type { ConnectedAccount } from "@/generated/prisma";

export abstract class ResyncConnectedAccountRepo {
  abstract findAccountByIdOrThrow(id: string): Promise<ConnectedAccount>;
}
