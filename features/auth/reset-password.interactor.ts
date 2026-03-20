import { z } from "zod";
import { redirect } from "next/navigation";

import { AuthService } from "./auth.service";

import { passwordSchema, type Data, type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";

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
  async invoke(data: ResetPasswordData): Validated<ResetPasswordData> {
    try {
      await this.authService.resetPassword({ newPassword: data.password, token: data.token });
    } catch {
      redirect("/auth/forgot-password?info=RESET_LINK_INVALID");
    }

    redirect("/auth/signin");
  }
}
