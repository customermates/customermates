import type { Redirect } from "@/features/auth/auth-outcome";
import type { RouteGuardService } from "@/features/auth/route-guard.service";
import type { OnboardingFunnelRepo } from "./onboarding-funnel.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { accountStateRedirect } from "@/features/auth/account-state";
import { redirectTo } from "@/features/auth/auth-outcome";

@SystemInteractor
export class RecordChannelSkippedInteractor {
  constructor(
    private readonly repo: Pick<OnboardingFunnelRepo, "recordFunnelEventUnscoped">,
    private readonly routeGuardService: RouteGuardService,
  ) {}

  async invoke(): Promise<{ ok: true; data: { recorded: boolean } } | Redirect> {
    const resolution = await this.routeGuardService.resolveAccountState();
    if (resolution.state !== "onboarding") return redirectTo(accountStateRedirect(resolution.state) ?? "/");
    const user = resolution.user;
    if (!user) return redirectTo("/auth/signin");
    if (!user.role?.isSystemRole) return redirectTo("/");

    const recorded = await this.repo.recordFunnelEventUnscoped({
      companyId: user.companyId,
      type: "channelSkipped",
      occurredAt: new Date(),
    });
    return { ok: true as const, data: { recorded } };
  }
}
