import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";

import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

const OutputSchema = z.discriminatedUnion("valid", [
  z.object({
    valid: z.literal(true),
    companyId: z.string(),
    expiresAt: z.date(),
    inviterName: z.string().min(1),
  }),
  z.object({
    valid: z.literal(false),
    errorMessage: z.enum(["invalidInviteLink", "inviteLinkExpired"]),
  }),
]);

const Schema = z.object({
  token: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
});
type InviteTokenData = Data<typeof Schema>;

type ValidatedInviteToken = z.infer<typeof OutputSchema>;

export abstract class InviteTokenRepo {
  abstract findTokenUnscoped(token: string): Promise<{
    companyId: string;
    createdBy: { email: string; firstName: string; lastName: string };
    expiresAt: Date;
  } | null>;
}

@SystemInteractor
export class InviteTokenValidationInteractor {
  constructor(private repo: InviteTokenRepo) {}

  @Validate(Schema)
  @ValidateOutput(OutputSchema)
  async invoke(data: InviteTokenData): Validated<ValidatedInviteToken> {
    if (!data.token) {
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

    if (Date.now() >= inviteToken.expiresAt.getTime()) {
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
        expiresAt: inviteToken.expiresAt,
        inviterName:
          `${inviteToken.createdBy.firstName} ${inviteToken.createdBy.lastName}`.trim() || inviteToken.createdBy.email,
      },
    };
  }
}
