import { nanoid } from "nanoid";
import { InviteToken, Resource, Action } from "@/generated/prisma";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";

const INVITE_TOKEN_EXPIRY_DAYS = 7;

export abstract class GetOrCreateInviteTokenRepo {
  abstract findUnexpiredTokenForCompany(): Promise<InviteToken | null>;
  abstract createInviteToken(data: { token: string; expiresAt: Date }): Promise<InviteToken>;
}

@AllowInDemoMode
@TentantInteractor({ resource: Resource.users, action: Action.create })
export class GetOrCreateInviteTokenInteractor {
  constructor(private repo: GetOrCreateInviteTokenRepo) {}

  @Transaction
  async invoke(): Promise<{ token: string; expiresAt: Date }> {
    const existingToken = await this.repo.findUnexpiredTokenForCompany();

    if (existingToken) return { token: existingToken.token, expiresAt: existingToken.expiresAt };

    const token = nanoid(32);
    const expiresAt = new Date();

    expiresAt.setDate(expiresAt.getDate() + INVITE_TOKEN_EXPIRY_DAYS);

    const inviteToken = await this.repo.createInviteToken({
      token,
      expiresAt,
    });

    return { token: inviteToken.token, expiresAt: inviteToken.expiresAt };
  }
}
