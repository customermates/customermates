import type { AuthService } from "./auth.service";
import type { UserService } from "../user/user.service";
import type { GetSubscriptionRepo } from "@/ee/subscription/get-subscription.interactor";
import type { Redirect } from "./auth-outcome";

import { Action, Status, SubscriptionStatus } from "@/generated/prisma";

import type { Resource } from "@/generated/prisma";

import { isRedirect, redirectTo } from "./auth-outcome";
import { env } from "@/env";

export type AccessOptions = {
  resource?: Resource;
  allowedActions?: Action[];
  skipSubscriptionCheck?: boolean;
  skipOnboardingWizardCheck?: boolean;
};

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

  async resolveAccess(options?: AccessOptions): Promise<Redirect | null> {
    const sessionResult = await this.authService.resolveSession();
    if (isRedirect(sessionResult)) return sessionResult;

    const user = await this.userService.getUser();

    if (!user) return redirectTo("/onboarding/wizard");

    if (user.status !== Status.active)
      return redirectTo(RouteGuardService.STATUS_REDIRECTS[user.status] ?? "/auth/signin");

    if (!options?.skipOnboardingWizardCheck && user.role?.isSystemRole && user.onboardingWizardCompletedAt == null)
      return redirectTo("/onboarding/wizard");

    if (!options?.skipSubscriptionCheck && !env.DEMO_MODE) {
      const subRedirect = await this.checkSubscription(user.companyId);
      if (subRedirect) return subRedirect;
    }

    if (!options?.resource) return null;

    if (user.role?.isSystemRole) return null;

    const allowed = options.allowedActions ?? [Action.readOwn, Action.readAll];

    const hasRequiredPermission =
      user.role?.permissions?.some((p) => p.resource === options.resource && allowed.includes(p.action)) ?? false;
    if (hasRequiredPermission) return null;

    return redirectTo("/");
  }

  async resolveUnauthenticated(): Promise<Redirect | null> {
    const session = await this.authService.getSession();
    if (!session) return null;

    const user = await this.userService.getUser();
    if (!user) return null;

    if (user.status !== Status.active)
      return redirectTo(RouteGuardService.STATUS_REDIRECTS[user.status] ?? "/auth/signin");

    if (user.role?.isSystemRole && user.onboardingWizardCompletedAt == null) return redirectTo("/onboarding/wizard");

    return redirectTo("/");
  }

  private async checkSubscription(companyId: string): Promise<Redirect | null> {
    const subscription = await this.subscriptionRepo.getSubscriptionOrThrow(companyId);

    const isExpired =
      subscription.status === SubscriptionStatus.unPaid ||
      subscription.status === SubscriptionStatus.expired ||
      (subscription.status === SubscriptionStatus.trial &&
        subscription.trialEndDate !== null &&
        subscription.trialEndDate < new Date());

    if (isExpired) return redirectTo("/subscription-expired");
    return null;
  }
}
