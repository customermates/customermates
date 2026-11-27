import type { AuthService } from "./auth.service";
import type { SendEmailCodeResult } from "./email-code";

import * as ErrorReporter from "@/core/observability/server";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

@SystemInteractor
export class ResendVerificationEmailInteractor {
  constructor(private readonly authService: AuthService) {}

  async invoke(): Promise<SendEmailCodeResult> {
    const session = await this.authService.getInteractiveSession();
    const email = session?.user?.email;
    if (!email) return { ok: false, error: "signedOut" };
    if (session.user.emailVerified) return { ok: true };

    try {
      const outcome = await this.authService.sendVerificationCode(email);
      return outcome === "sent" ? { ok: true } : { ok: false, error: "rateLimited" };
    } catch (error) {
      ErrorReporter.captureException(error);
      return { ok: false, error: "failed" };
    }
  }
}
