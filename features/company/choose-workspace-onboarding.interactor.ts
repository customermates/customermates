import type { RouteGuardService } from "@/features/auth/route-guard.service";
import type { Redirect } from "@/features/auth/auth-outcome";
import type { InviteTokenCookieRepo } from "./invite-token-cookie.repo";
import type { OnboardingIntentService } from "./onboarding-intent.service";

import { accountStateRedirect } from "@/features/auth/account-state";
import { redirectTo } from "@/features/auth/auth-outcome";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { pathWithOnboardingIntent } from "./onboarding-intent-url";

@SystemInteractor
export class ChooseWorkspaceOnboardingInteractor {
  constructor(
    private readonly routeGuardService: RouteGuardService,
    private readonly onboardingIntentService: OnboardingIntentService,
    private readonly inviteTokenCookieRepo: InviteTokenCookieRepo,
  ) {}

  async invoke(data: { choice: unknown }): Promise<Redirect | null> {
    if (data.choice !== "create" && data.choice !== "join") return null;

    const resolution = await this.routeGuardService.resolveAccountState();
    if (resolution.state !== "unregistered") return redirectTo(accountStateRedirect(resolution.state) ?? "/");
    if (!resolution.sessionUser) return redirectTo("/auth/signin");

    await this.inviteTokenCookieRepo.clear();
    if (data.choice === "join") return redirectTo("/onboarding/join");

    const intent = this.onboardingIntentService.issueCreateCompany(resolution.sessionUser.id);
    return redirectTo(pathWithOnboardingIntent("/onboarding/wizard", intent));
  }
}
