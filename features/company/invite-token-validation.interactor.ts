import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import type { InviteToken } from "@/generated/prisma";

import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

const OutputSchema = z.discriminatedUnion("valid", [
  z.object({ valid: z.literal(true), companyId: z.string() }),
  z.object({ valid: z.literal(false), errorMessage: z.string() }),
]);

const TOKEN_FORMAT = /^[a-zA-Z0-9_-]+$/;

const Schema = z.object({
  token: z.string().optional(),
});
type InviteTokenData = Data<typeof Schema>;

type ValidatedInviteToken = z.infer<typeof OutputSchema>;

export abstract class InviteTokenRepo {
  abstract findTokenUnscoped(token: string): Promise<InviteToken | null>;
}

@SystemInteractor
export class InviteTokenValidationInteractor {
  constructor(private repo: InviteTokenRepo) {}

  @Enforce(Schema)
  @ValidateOutput(OutputSchema)
  async invoke(data: InviteTokenData): Promise<{ ok: true; data: ValidatedInviteToken }> {
    if (!data.token || !TOKEN_FORMAT.test(data.token)) {
      return {
        ok: true,
        data: {
          valid: false,
          errorMessage: "invalidInviteLink",
        },
      };
    }

    const inviteToken = await this.repo.findTokenUnscoped(data.token);

    if (!inviteToken) {
      return {
        ok: true,
        data: {
          valid: false,
          errorMessage: "invalidInviteLink",
        },
      };
    }

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
      },
    };
  }
}
