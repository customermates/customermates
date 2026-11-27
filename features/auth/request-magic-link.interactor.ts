import type { Data, Validated } from "@/core/validation/validation.utils";
import type { AuthService } from "./auth.service";
import type { Redirect } from "./auth-outcome";

import { z } from "zod";
import { getTranslations } from "next-intl/server";

import { Validate } from "@/core/decorators/validate.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError } from "@/core/validation/validation.utils";
import { onboardingIntentFromPath, pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";
import { redirectTo } from "./auth-outcome";
import { callbackUrlSchema } from "./callback-url.schema";
import { refusesDisposableEmail } from "./disposable-email";

const Schema = z.object({
  email: z.email(),
  callbackURL: callbackUrlSchema.optional(),
});
export type RequestMagicLinkData = Data<typeof Schema>;

@SystemInteractor
export class RequestMagicLinkInteractor {
  constructor(private readonly authService: AuthService) {}

  @Validate(Schema)
  async invoke(data: RequestMagicLinkData): Promise<Awaited<Validated<{ email: string }>> | Redirect> {
    const email = data.email.trim().toLowerCase();
    const onboardingIntent = onboardingIntentFromPath(data.callbackURL);
    if (onboardingIntent.status === "invalid") return redirectTo("/auth/error?type=invalidOnboardingIntent");

    if (refusesDisposableEmail(email)) {
      const t = await getTranslations();
      return this.refuse(t("Common.errors.disposableEmail"), CustomErrorCode.disposableEmail, ["email"]);
    }

    const sent = await this.authService.requestMagicLink({
      email,
      callbackURL: data.callbackURL,
      errorCallbackURL:
        onboardingIntent.status === "valid"
          ? pathWithOnboardingIntent("/auth/signin", onboardingIntent.intent)
          : "/auth/signin",
    });

    if (!sent.ok) {
      const t = await getTranslations();
      return sent.error === CustomErrorCode.disposableEmail
        ? this.refuse(t("Common.errors.disposableEmail"), CustomErrorCode.disposableEmail, ["email"])
        : this.refuse(t("Common.errors.magicLinkRateLimited"), CustomErrorCode.magicLinkRateLimited);
    }

    return { ok: true as const, data: { email } };
  }

  private refuse(message: string, code: CustomErrorCode, path: string[] = []) {
    return { ok: false as const, error: createZodError(message, path, { error: code }) };
  }
}
