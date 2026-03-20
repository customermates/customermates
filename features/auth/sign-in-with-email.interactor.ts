import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AuthService } from "./auth.service";

import { Validate } from "@/core/decorators/validate.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError } from "@/core/validation/validation.utils";

const Schema = z.object({
  email: z.email(),
  password: z.string().min(8),
  rememberMe: z.boolean(),
  callbackURL: z.string().optional(),
});
export type EmailSignInData = Data<typeof Schema>;

@SystemInteractor
export class SignInWithEmailInteractor {
  constructor(private readonly authService: AuthService) {}

  @Validate(Schema)
  async invoke(data: EmailSignInData): Validated<EmailSignInData> {
    const res = await this.authService.signInWithEmail({
      email: data.email,
      password: data.password,
      rememberMe: data.rememberMe,
    });

    if (!res.ok) {
      if (res.error === CustomErrorCode.emailNotVerified) redirect("/auth/verify-email");
      const t = await getTranslations("Common.errors");
      const error = createZodError<EmailSignInData>(t(res.error));

      return {
        ok: false,
        error,
      };
    }

    redirect(data.callbackURL ?? "/");
  }
}
