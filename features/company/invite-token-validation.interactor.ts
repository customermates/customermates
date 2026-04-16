import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import type { InviteToken } from "@/generated/prisma";

import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

const ValidatedInviteTokenSchema = z.discriminatedUnion("valid", [
  z.object({ valid: z.literal(true), companyId: z.string(), companyName: z.string() }),
  z.object({ valid: z.literal(false), errorMessage: z.string() }),
]);

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
export class InviteTokenValidationInteractor extends BaseInteractor<InviteTokenData, ValidatedInviteToken> {
  constructor(private repo: InviteTokenRepo) {
    super();
  }

  @Enforce(Schema)
  @ValidateOutput(ValidatedInviteTokenSchema)
  async invoke(data: InviteTokenData): Promise<{ ok: true; data: ValidatedInviteToken }> {
    try {
      if (!data.token) {
        return {
          ok: true,
          data: {
            valid: false,
            errorMessage: "invalidInviteLink",
          },
        };
      }

      const inviteToken = await this.repo.findTokenOrThrow(data.token);

      if (new Date() > inviteToken.expiresAt) {
        return {
          ok: true,
          data: {
            valid: false,
            errorMessage: "inviteLinkExpired",
          },
        };
      }

      return {
        ok: true,
        data: {
          valid: true,
          companyId: inviteToken.companyId,
          companyName: inviteToken.companyName,
        },
      };
    } catch {
      return {
        ok: true,
        data: {
          valid: false,
          errorMessage: "invalidInviteLink",
        },
      };
    }
  }
}
