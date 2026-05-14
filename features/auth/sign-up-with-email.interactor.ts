import type { AuthService } from "./auth.service";
import type { Redirect } from "./auth-outcome";

import { z } from "zod";
import { getTranslations } from "next-intl/server";

import { createZodError, passwordSchema, type Data, type Validated } from "@/core/validation/validation.utils";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { Validate } from "@/core/decorators/validate.decorator";
import { redirectTo } from "./auth-outcome";

const Schema = z
  .object({
    email: z.email(),
    confirmEmail: z.email(),
    password: passwordSchema(),
    confirmPassword: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.email !== data.confirmEmail) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.emailMismatch },
        path: ["confirmEmail"],
      });
    }

    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.passwordMismatch },
        path: ["confirmPassword"],
      });
    }
  });
export type EmailSignUpData = Data<typeof Schema>;

@SystemInteractor
export class SignUpWithEmailInteractor {
  constructor(private authService: AuthService) {}

  @Validate(Schema)
  async invoke(data: EmailSignUpData): Promise<Awaited<Validated<EmailSignUpData>> | Redirect> {
    const res = await this.authService.registerWithEmail({
      email: data.email,
      name: data.email,
      password: data.password,
    });

    if (!res.ok) {
      const t = await getTranslations("Common.errors");
      const error = createZodError<EmailSignUpData>(t(res.error));
      return {
        ok: false,
        error,
      };
    }
    return redirectTo("/");
  }
}
