import type { AuthService } from "./auth.service";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

@SystemInteractor
export class ResendVerificationEmailInteractor {
  constructor(private readonly authService: AuthService) {}

  async invoke(callbackURL?: string): Promise<{ ok: boolean }> {
    const session = await this.authService.getSession();
    if (!session?.user?.email) return { ok: false };

    await this.authService.resendVerificationEmail(session.user.email, { callbackURL, keepSession: true });

    return { ok: true };
  }
}
