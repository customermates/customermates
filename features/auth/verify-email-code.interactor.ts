import type { AuthService } from "./auth.service";

import { z } from "zod";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { EMAIL_CODE_PATTERN, emailCodeDigits, type VerifyEmailCodeResult } from "./email-code";

const Schema = z.object({ code: z.string().max(64) });

export type VerifyEmailCodeData = z.input<typeof Schema>;

@SystemInteractor
export class VerifyEmailCodeInteractor {
  constructor(private readonly authService: AuthService) {}

  async invoke(data: VerifyEmailCodeData): Promise<VerifyEmailCodeResult> {
    const parsed = Schema.safeParse(data);
    const code = parsed.success ? emailCodeDigits(parsed.data.code) : "";

    const session = await this.authService.getInteractiveSession();
    if (!session) return { ok: false, error: "signedOut" };
    if (session.user.emailVerified) return { ok: true };
    if (!EMAIL_CODE_PATTERN.test(code)) return { ok: false, error: "invalid" };

    return this.authService.verifyEmailCode(session.user.email, code);
  }
}
