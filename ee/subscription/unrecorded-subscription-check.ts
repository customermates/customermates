import type { SubscriptionPlan } from "@/generated/prisma";
import type { DeleteAccountsForPlanInteractor } from "@/ee/messaging/connect/delete-accounts-for-plan.interactor";
import type { ProcessLemonSqueezyWebhookRepo } from "./process-lemon-squeezy-webhook.repo";
import type { LemonSqueezySubscription, SubscriptionService } from "./subscription.service";

import * as Sentry from "@sentry/nextjs";

export type UnrecordedSubscriptionOutcome = "none" | "recorded" | "unverified";

type Workspace = { companyId: string; plan: SubscriptionPlan };
type Provider = Pick<SubscriptionService, "listStoreSubscriptionsByEmailOrThrowUnscoped" | "syncSubscription">;
type Bindings = Pick<ProcessLemonSqueezyWebhookRepo, "findWorkspaceBillingBySubscriptionIdUnscoped">;
type PlanAccounts = Pick<DeleteAccountsForPlanInteractor, "invoke">;

function createdAt(subscription: LemonSqueezySubscription): number {
  const value = subscription.data.attributes.created_at;
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

export class UnrecordedSubscriptionCheck {
  constructor(
    private readonly provider: Provider,
    private readonly bindings: Bindings,
    private readonly planAccounts: PlanAccounts,
  ) {}

  async recordUnscoped(workspace: Workspace, emails: string[]): Promise<UnrecordedSubscriptionOutcome> {
    let unrecorded: LemonSqueezySubscription[];
    try {
      unrecorded = await this.findUnrecorded(emails);
    } catch (error) {
      Sentry.captureException(error, {
        level: "warning",
        tags: { kind: "workspace-delete-billing-verification", companyId: workspace.companyId },
      });
      return "unverified";
    }
    if (unrecorded.length === 0) return "none";

    const [newest] = unrecorded.sort((left, right) => createdAt(right) - createdAt(left));
    const synced = await this.provider.syncSubscription({ ...workspace, lemonSqueezyId: null }, newest, {
      whileDeleting: true,
    });
    if (!synced) return "unverified";

    if (synced.changedPlan) await this.planAccounts.invoke({ companyId: synced.companyId, plan: synced.changedPlan });

    return "recorded";
  }

  private async findUnrecorded(emails: string[]): Promise<LemonSqueezySubscription[]> {
    const listed = await Promise.all(
      [...new Set(emails.map((email) => email.trim().toLowerCase()))].map((email) =>
        this.provider.listStoreSubscriptionsByEmailOrThrowUnscoped(email),
      ),
    );
    const unique = new Map(listed.flat().map((subscription) => [subscription.data.id, subscription]));

    const unrecorded: LemonSqueezySubscription[] = [];
    for (const subscription of unique.values()) {
      if (subscription.data.attributes.status === "expired") continue;
      if (await this.bindings.findWorkspaceBillingBySubscriptionIdUnscoped(subscription.data.id)) continue;
      unrecorded.push(subscription);
    }
    return unrecorded;
  }
}
