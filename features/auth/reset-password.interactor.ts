import type { AuthService } from "./auth.service";
import type { Redirect } from "./auth-outcome";
import type { OnboardingIntentService } from "@/features/company/onboarding-intent.service";

import { z } from "zod";

import { zx, type Data, type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { redirectTo } from "./auth-outcome";
import { callbackUrlSchema } from "./callback-url.schema";
import { pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";

const PasswordFieldsSchema = z.object({
  password: zx.password(),
  confirmPassword: z.string(),
  token: z.string(),
  onboardingIntent: z.string().optional(),
});

function validatePasswordMatch(data: { password: string; confirmPassword: string }, ctx: z.RefinementCtx) {
  if (data.password !== data.confirmPassword) {
    ctx.addIssue({
      code: "custom",
      params: { error: CustomErrorCode.passwordMismatch },
      path: ["confirmPassword"],
    });
  }
}

export type ResetPasswordData = Data<typeof PasswordFieldsSchema>;

type ResetPasswordRedirects = {
  error: string;
  success: string;
};

const InvocationSchema = PasswordFieldsSchema.extend({
  errorRedirect: callbackUrlSchema,
  successRedirect: callbackUrlSchema,
}).superRefine(validatePasswordMatch);
type ResetPasswordInvocation = Data<typeof InvocationSchema>;

@SystemInteractor
export class ResetPasswordInteractor {
  constructor(
    private readonly authService: AuthService,
    private readonly onboardingIntentService: OnboardingIntentService,
  ) {}

  async invoke(data: ResetPasswordData): Promise<Awaited<Validated<ResetPasswordData>> | Redirect> {
    let redirects: ResetPasswordRedirects = {
      error: "/auth/forgot-password?info=RESET_LINK_INVALID",
      success: "/auth/signin",
    };
    if (data?.onboardingIntent !== undefined) {
      const onboardingIntent = await this.onboardingIntentService.resolve(data.onboardingIntent);
      if (onboardingIntent.status === "valid") {
        redirects = {
          error: pathWithOnboardingIntent("/auth/forgot-password?info=RESET_LINK_INVALID", onboardingIntent.intent),
          success: pathWithOnboardingIntent("/auth/signin", onboardingIntent.intent),
        };
      }
    }

    return this.reset({
      ...data,
      errorRedirect: redirects.error,
      successRedirect: redirects.success,
    });
  }

  @Validate(InvocationSchema)
  private async reset(data: ResetPasswordInvocation): Promise<Awaited<Validated<ResetPasswordData>> | Redirect> {
    try {
      await this.authService.resetPassword({ newPassword: data.password, token: data.token });
    } catch {
      return redirectTo(data.errorRedirect);
    }

    return redirectTo(data.successRedirect);
  }
}
