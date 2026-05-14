import type { AuthService } from "./auth.service";
import type { Redirect } from "./auth-outcome";

import { z } from "zod";

import { passwordSchema, type Data, type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { redirectTo } from "./auth-outcome";

const Schema = z
  .object({
    password: passwordSchema(),
    confirmPassword: z.string(),
    token: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.passwordMismatch },
        path: ["confirmPassword"],
      });
    }
  });
export type ResetPasswordData = Data<typeof Schema>;

@SystemInteractor
export class ResetPasswordInteractor {
  constructor(private readonly authService: AuthService) {}

  @Validate(Schema)
  async invoke(data: ResetPasswordData): Promise<Awaited<Validated<ResetPasswordData>> | Redirect> {
    try {
      await this.authService.resetPassword({ newPassword: data.password, token: data.token });
    } catch {
      return redirectTo("/auth/forgot-password?info=RESET_LINK_INVALID");
    }

    return redirectTo("/auth/signin");
  }
}
