import type { Data, Validated } from "@/core/validation/validation.utils";
import type { AuthService } from "./auth.service";

import { z } from "zod";

import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { callbackUrlSchema } from "./callback-url.schema";

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
  constructor(private readonly authService: AuthService) {}

  async invoke(data: RequestPasswordResetData, redirectTo?: string): Validated<RequestPasswordResetData> {
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
