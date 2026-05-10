import type { AuthService } from "./auth.service";
import type { UserService } from "../user/user.service";
import type { GetSubscriptionRepo } from "@/ee/subscription/get-subscription.interactor";

import { redirect } from "next/navigation";
import { Action, Status, SubscriptionStatus } from "@/generated/prisma";

import type { Resource } from "@/generated/prisma";

import { IS_DEMO_MODE } from "@/constants/env";

export class RouteGuardService {
  constructor(
    private authService: AuthService,
    private userService: UserService,
    private subscriptionRepo: GetSubscriptionRepo,
  ) {}
  private static readonly STATUS_REDIRECTS: Partial<Record<Status, string>> = {
    [Status.inactive]: "/auth/error?type=inactiveUser",
    [Status.pendingAuthorization]: "/auth/pending",
  };

  async ensureAccessOrRedirect(options?: {
    resource?: Resource;
    allowedActions?: Action[];
    skipSubscriptionCheck?: boolean;
    skipOnboardingWizardCheck?: boolean;
  }): Promise<void> {
    await this.authService.getSessionOrRedirect();

    const user = await this.userService.getUser();

    if (!user) redirect("/onboarding/wizard");

    if (user.status !== Status.active) redirect(RouteGuardService.STATUS_REDIRECTS[user.status] ?? "/auth/signin");

    if (!options?.skipOnboardingWizardCheck && user.role?.isSystemRole && user.onboardingWizardCompletedAt == null)
      redirect("/onboarding/wizard");

    if (!options?.skipSubscriptionCheck && !IS_DEMO_MODE) await this.checkSubscriptionAndRedirect(user.companyId);

    if (!options?.resource) return;

    if (user.role?.isSystemRole) return;

    const allowed = options.allowedActions ?? [Action.readOwn, Action.readAll];

    const hasRequiredPermission =
      user.role?.permissions?.some((p) => p.resource === options.resource && allowed.includes(p.action)) ?? false;
    if (hasRequiredPermission) return;

    redirect("/");
  }

  async ensureUnauthenticatedOrRedirect(): Promise<void> {
    const session = await this.authService.getSession();
    if (!session) return;

    const user = await this.userService.getUser();
    if (!user) return;

    if (user.status !== Status.active) redirect(RouteGuardService.STATUS_REDIRECTS[user.status] ?? "/auth/signin");

    if (user.role?.isSystemRole && user.onboardingWizardCompletedAt == null) redirect("/onboarding/wizard");

    redirect("/");
  }

  private async checkSubscriptionAndRedirect(companyId: string): Promise<void> {
    const subscription = await this.subscriptionRepo.getSubscriptionOrThrow(companyId);

    const isExpired =
      subscription.status === SubscriptionStatus.unPaid ||
      subscription.status === SubscriptionStatus.expired ||
      (subscription.status === SubscriptionStatus.trial &&
        subscription.trialEndDate !== null &&
        subscription.trialEndDate < new Date());

    if (isExpired) redirect("/subscription-expired");
  }
}
