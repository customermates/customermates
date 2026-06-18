import type { Data, Validated } from "@/core/validation/validation.utils";
import type { AuthService } from "./auth.service";
import type { Redirect } from "./auth-outcome";

import { z } from "zod";
import { getTranslations } from "next-intl/server";

import { redirectTo } from "./auth-outcome";
import { callbackUrlSchema } from "./callback-url.schema";
import { Validate } from "@/core/decorators/validate.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError } from "@/core/validation/validation.utils";

const Schema = z.object({
  email: z.email(),
  password: z.string().min(8),
  rememberMe: z.boolean(),
  callbackURL: callbackUrlSchema.optional(),
});
export type EmailSignInData = Data<typeof Schema>;

@SystemInteractor
export class SignInWithEmailInteractor {
  constructor(private readonly authService: AuthService) {}

  @Validate(Schema)
  async invoke(data: EmailSignInData): Promise<Awaited<Validated<EmailSignInData>> | Redirect> {
    const res = await this.authService.signInWithEmail({
      email: data.email,
      password: data.password,
      rememberMe: data.rememberMe,
    });

    if (!res.ok) {
      if (res.error === CustomErrorCode.emailNotVerified) return redirectTo("/auth/verify-email");
      const t = await getTranslations();
      const error = createZodError<EmailSignInData>(t(`Common.errors.${res.error}`));

      return {
        ok: false,
        error,
      };
    }

    return redirectTo(data.callbackURL ?? "/");
  }
}
