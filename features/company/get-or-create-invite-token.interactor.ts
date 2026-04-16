import { nanoid } from "nanoid";
import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import type { InviteToken } from "@/generated/prisma";

import { BaseInteractor } from "@/core/base/base-interactor";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
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
@TentantInteractor({ resource: Resource.users, action: Action.create })
export class GetOrCreateInviteTokenInteractor extends BaseInteractor<void, { token: string; expiresAt: Date }> {
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
