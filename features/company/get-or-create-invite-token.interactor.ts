import { nanoid } from "nanoid";
import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import type { InviteToken } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

const InviteTokenResultSchema = z.object({
  token: z.string(),
  expiresAt: z.date(),
});

const INVITE_TOKEN_EXPIRY_DAYS = 7;

export abstract class GetOrCreateInviteTokenRepo {
  abstract findUnexpiredTokenForCompany(): Promise<InviteToken | null>;
  abstract createInviteToken(data: { token: string; expiresAt: Date }): Promise<InviteToken>;
}

@AllowInDemoMode
@TenantInteractor({ resource: Resource.users, action: Action.create })
export class GetOrCreateInviteTokenInteractor extends AuthenticatedInteractor<
  void,
  { token: string; expiresAt: Date }
> {
  constructor(private repo: GetOrCreateInviteTokenRepo) {
    super();
  }

  @ValidateOutput(InviteTokenResultSchema)
  @Transaction
  async invoke(): Promise<{ ok: true; data: { token: string; expiresAt: Date } }> {
    const existingToken = await this.repo.findUnexpiredTokenForCompany();

    if (existingToken)
      return { ok: true as const, data: { token: existingToken.token, expiresAt: existingToken.expiresAt } };

    const token = nanoid(32);
    const expiresAt = new Date();

    expiresAt.setDate(expiresAt.getDate() + INVITE_TOKEN_EXPIRY_DAYS);

    const inviteToken = await this.repo.createInviteToken({
      token,
      expiresAt,
    });

    return { ok: true as const, data: { token: inviteToken.token, expiresAt: inviteToken.expiresAt } };
  }
}
