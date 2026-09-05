import type { AuthService } from "./auth.service";
import type { Redirect } from "./auth-outcome";
import type { OnboardingIntentService } from "@/features/company/onboarding-intent.service";

import { z } from "zod";
import { getTranslations } from "next-intl/server";

import { createZodError, zx, type Data, type Validated } from "@/core/validation/validation.utils";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { Validate } from "@/core/decorators/validate.decorator";
import { redirectTo } from "./auth-outcome";
import { callbackUrlSchema } from "./callback-url.schema";
import { pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";

const Schema = z
  .object({
    email: z.email(),
    confirmEmail: z.email(),
    password: zx.password(),
    confirmPassword: z.string(),
    callbackURL: callbackUrlSchema.optional(),
    onboardingIntent: z.string().optional(),
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
  constructor(
    private authService: AuthService,
    private onboardingIntentService: OnboardingIntentService,
  ) {}

  async invoke(data: EmailSignUpData): Promise<Awaited<Validated<EmailSignUpData>> | Redirect> {
    if (data?.onboardingIntent !== undefined) {
      const invitation = await this.onboardingIntentService.resolve(data.onboardingIntent);
      if (invitation.status !== "valid" || invitation.type !== "invitation") {
        const errorMessage = invitation.status === "invalid" ? invitation.errorMessage : "invalidOnboardingIntent";
        return redirectTo(`/auth/error?type=${errorMessage}`);
      }

      return this.signUp({ ...data, callbackURL: pathWithOnboardingIntent("/auth/invitation", invitation.intent) });
    }

    return this.signUp(data);
  }

  @Validate(Schema)
  private async signUp(data: EmailSignUpData): Promise<Awaited<Validated<EmailSignUpData>> | Redirect> {
    const res = await this.authService.registerWithEmail({
      email: data.email,
      name: data.email,
      password: data.password,
      callbackURL: data.callbackURL,
    });

    if (!res.ok) {
      const t = await getTranslations();
      const error = createZodError<EmailSignUpData>(t(`Common.errors.${res.error}`));
      return {
        ok: false,
        error,
      };
    }
    return redirectTo(data.callbackURL ?? "/onboarding");
  }
}
