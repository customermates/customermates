import type { Data, Validated } from "@/core/validation/validation.utils";
import type { AuthService } from "./auth.service";
import type { OnboardingIntentService } from "@/features/company/onboarding-intent.service";

import { z } from "zod";

import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { callbackUrlSchema } from "./callback-url.schema";
import { pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";

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
const InvocationSchema = Schema.and(z.object({ redirectTo: callbackUrlSchema.optional() }));
type RequestPasswordResetInvocation = Data<typeof InvocationSchema>;

@SystemInteractor
export class RequestPasswordResetInteractor {
  constructor(
    private readonly authService: AuthService,
    private readonly onboardingIntentService: OnboardingIntentService,
  ) {}

  async invoke(data: RequestPasswordResetData, onboardingIntentValue?: string): Validated<RequestPasswordResetData> {
    let redirectTo: string | undefined;
    if (onboardingIntentValue !== undefined) {
      const onboardingIntent = await this.onboardingIntentService.resolve(onboardingIntentValue);
      if (onboardingIntent.status === "valid")
        redirectTo = pathWithOnboardingIntent("/auth/reset-password", onboardingIntent.intent);
    }

    return this.request({ ...data, redirectTo });
  }

  @Validate(InvocationSchema)
  @ValidateOutput(Schema)
  private async request(data: RequestPasswordResetInvocation): Validated<RequestPasswordResetData> {
    const { redirectTo, ...requestData } = data;
    await this.authService.requestPasswordReset(data.email, redirectTo);

    return { ok: true as const, data: requestData };
  }
}
