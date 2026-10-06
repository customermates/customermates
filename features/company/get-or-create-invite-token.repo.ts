import type { InviteToken } from "@/generated/prisma";

export abstract class GetOrCreateInviteTokenRepo {
  abstract findUnexpiredToken(): Promise<InviteToken | null>;
  abstract createInviteToken(data: { token: string; expiresAt: Date }): Promise<InviteToken>;
}
