import { redirect } from "next/navigation";
import { Action, Resource, Status, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import { UserService } from "../user/user.service";

import { GetSubscriptionRepo } from "@/ee/subscription/get-subscription.interactor";
import { TenantAgnostic } from "@/core/decorators/tenant-agnostic.decorator";
import { IS_DEMO_MODE } from "@/constants/env";

@TenantAgnostic
export class RouteGuardService {
  constructor(
    private userService: UserService,
    private subscriptionRepo: GetSubscriptionRepo,
  ) {}
  private static readonly STATUS_REDIRECTS: Partial<Record<Status, string>> = {
    [Status.inactive]: "/auth/error?type=inactiveUser",
    [Status.pendingAuthorization]: "/auth/pending",
  };

  private static readonly RESOURCE_REDIRECTS: Partial<Record<Resource, string>> = {
    [Resource.contacts]: "/contacts",
    [Resource.organizations]: "/organizations",
    [Resource.deals]: "/deals",
    [Resource.services]: "/services",
    [Resource.tasks]: "/tasks",
    [Resource.company]: "/company",
  };

  async ensureAccessOrRedirect(options?: {
    resource?: Resource;
    allowedActions?: Action[];
    skipSubscriptionCheck?: boolean;
    requiredPlan?: SubscriptionPlan;
  }): Promise<void> {
    const user = await this.userService.getUser();

    if (!user) redirect("/onboarding");

    if (user.status !== Status.active) {
      const path = RouteGuardService.STATUS_REDIRECTS[user.status] ?? "/auth/signin";
      redirect(path);
    }

    if (!options?.skipSubscriptionCheck && !IS_DEMO_MODE)
      await this.checkSubscriptionAndRedirect(user.companyId, options?.requiredPlan);

    if (!options?.resource) return;

    if (user.role?.isSystemRole) return;

    const allowed = options.allowedActions ?? [Action.readOwn, Action.readAll];

    const hasRequiredPermission =
      user.role?.permissions?.some((p) => p.resource === options.resource && allowed.includes(p.action)) ?? false;
    if (hasRequiredPermission) return;

    for (const [resource, path] of Object.entries(RouteGuardService.RESOURCE_REDIRECTS)) {
      const hasRequiredPermission =
        user.role?.permissions?.some((p) => p.resource === resource && allowed.includes(p.action)) ?? false;
      if (hasRequiredPermission) redirect(path);
    }

    redirect("/");
  }

  private async checkSubscriptionAndRedirect(companyId: string, requiredPlan?: SubscriptionPlan): Promise<void> {
    const subscription = await this.subscriptionRepo.getSubscriptionOrThrow(companyId);

    const isExpired =
      subscription.status === SubscriptionStatus.unPaid ||
      subscription.status === SubscriptionStatus.expired ||
      (subscription.status === SubscriptionStatus.trial &&
        subscription.trialEndDate !== null &&
        subscription.trialEndDate < new Date());

    if (isExpired) redirect("/subscription-expired");
    if (requiredPlan && subscription.plan !== requiredPlan) redirect("/");
  }
}
