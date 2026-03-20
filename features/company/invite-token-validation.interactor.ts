import { z } from "zod";
import { InviteToken } from "@/generated/prisma";

import { Data } from "@/core/validation/validation.utils";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

const Schema = z.object({
  token: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
});
export type InviteTokenData = Data<typeof Schema>;

export type ValidatedInviteToken =
  | {
      valid: true;
      companyId: string;
      companyName: string;
    }
  | {
      valid: false;
      errorMessage: string;
    };

export abstract class InviteTokenRepo {
  abstract findTokenOrThrow(token: string): Promise<InviteToken & { companyName: string }>;
}

@SystemInteractor
export class InviteTokenValidationInteractor {
  constructor(private repo: InviteTokenRepo) {}

  @Enforce(Schema)
  async invoke(data: InviteTokenData): Promise<ValidatedInviteToken> {
    try {
      if (!data.token) {
        return {
          valid: false,
          errorMessage: "invalidInviteLink",
        };
      }

      const inviteToken = await this.repo.findTokenOrThrow(data.token);

      if (new Date() > inviteToken.expiresAt) {
        return {
          valid: false,
          errorMessage: "inviteLinkExpired",
        };
      }

      return {
        valid: true,
        companyId: inviteToken.companyId,
        companyName: inviteToken.companyName,
      };
    } catch {
      return {
        valid: false,
        errorMessage: "invalidInviteLink",
      };
    }
  }
}
