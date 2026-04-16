import type { Data, Validated } from "@/core/validation/validation.utils";
import type { AuthService } from "./auth.service";

import { z } from "zod";

import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";

const Schema = z
  .object({
    email: z.email(),
    confirmEmail: z.email(),
  })
  .superRefine((data, ctx) => {
    if (data.email !== data.confirmEmail) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.emailMismatch },
        path: ["confirmEmail"],
      });
    }
  });
export type RequestPasswordResetData = Data<typeof Schema>;

@SystemInteractor
export class RequestPasswordResetInteractor extends BaseInteractor<RequestPasswordResetData, RequestPasswordResetData> {
  constructor(private readonly authService: AuthService) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(Schema)
  async invoke(data: RequestPasswordResetData): Validated<RequestPasswordResetData> {
    await this.authService.requestPasswordReset(data.email);

    return { ok: true as const, data };
  }
}
