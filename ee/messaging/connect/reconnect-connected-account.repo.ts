import type { ConnectedAccount } from "@/generated/prisma";

export abstract class ReconnectConnectedAccountRepo {
  abstract findOwnedAccountById(id: string): Promise<ConnectedAccount | null>;
}
