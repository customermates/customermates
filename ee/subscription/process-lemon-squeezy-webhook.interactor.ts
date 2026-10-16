import type { LemonSqueezySubscription, SubscriptionService } from "./subscription.service";
import type { ProcessLemonSqueezyWebhookRepo, WorkspaceBilling } from "./process-lemon-squeezy-webhook.repo";
import type { DeleteAccountsForPlanInteractor } from "@/ee/messaging/connect/delete-accounts-for-plan.interactor";
import type { EmailService } from "@/features/email/email.service";

import React from "react";
import { SubscriptionStatus } from "@/generated/prisma";

import BillingWebhookAlert from "@/components/emails/billing-webhook-alert";
import {
  BILLING_WEBHOOK_ALERT_COPY,
  type BillingWebhookAlertReason,
} from "@/components/emails/billing-webhook-alert-copy";
import { DEFAULT_EMAIL_LAYOUT_COPY } from "@/components/emails/base/email-layout-copy";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { env } from "@/env";
import { DEFAULT_LOCALE } from "@/i18n/locale-registry";

import { isCheckoutWorkspaceSignature } from "./checkout-workspace-signature";
import { acceptsUnsignedCheckoutClaim } from "./unsigned-checkout-claims";

export type LemonSqueezyWebhookEvent = {
  eventName: string;
  subscriptionId: string;
  subscriptionCreatedAt: Date | null;
  claim: { companyId: string; signature: string | null } | null;
};

const LIVE_STATUSES = new Set<SubscriptionStatus>([
  SubscriptionStatus.active,
  SubscriptionStatus.trial,
  SubscriptionStatus.pastDue,
]);
const LIVE_PROVIDER_STATUSES = new Set(["active", "on_trial", "past_due"]);

function hasLiveBinding(workspace: WorkspaceBilling): workspace is WorkspaceBilling & { lemonSqueezyId: string } {
  return workspace.lemonSqueezyId !== null && LIVE_STATUSES.has(workspace.status);
}

function createdAt(subscription: LemonSqueezySubscription): number {
  const value = subscription.data.attributes.created_at;
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

function replaces(incoming: LemonSqueezySubscription, current: LemonSqueezySubscription): boolean {
  return LIVE_PROVIDER_STATUSES.has(incoming.data.attributes.status) && createdAt(incoming) > createdAt(current);
}

@SystemInteractor
export class ProcessLemonSqueezyWebhookInteractor {
  constructor(
    private repo: ProcessLemonSqueezyWebhookRepo,
    private subscriptionService: SubscriptionService,
    private deleteAccountsForPlan: DeleteAccountsForPlanInteractor,
    private emailService: EmailService,
  ) {}

  async invoke(event: LemonSqueezyWebhookEvent): Promise<{ applied: boolean }> {
    const bound = await this.repo.findWorkspaceBillingBySubscriptionIdUnscoped(event.subscriptionId);
    if (bound) return this.apply(bound, await this.provider(event.subscriptionId));

    const { claim } = event;
    if (!claim) return this.refuse("unclaimed", event, null);

    const workspace = await this.repo.findWorkspaceBillingUnscoped(claim.companyId);
    if (claim.signature === null) {
      if (workspace && !hasLiveBinding(workspace) && acceptsUnsignedCheckoutClaim(event.subscriptionCreatedAt))
        return this.apply(workspace, await this.provider(event.subscriptionId));
      return this.refuse("unsigned", event, workspace);
    }

    if (!isCheckoutWorkspaceSignature(claim.companyId, claim.signature, env.BETTER_AUTH_SECRET))
      return this.refuse("forged", event, workspace);
    if (!workspace) return this.refuse("workspaceMissing", event, null);
    if (!hasLiveBinding(workspace)) return this.apply(workspace, await this.provider(event.subscriptionId));

    const [incoming, current] = await Promise.all([
      this.provider(event.subscriptionId),
      this.provider(workspace.lemonSqueezyId),
    ]);
    if (!replaces(incoming, current)) return this.refuse("duplicate", event, workspace, workspace.lemonSqueezyId);

    const outcome = await this.apply(workspace, incoming);
    await this.alert("replaced", event, workspace, workspace.lemonSqueezyId);
    return outcome;
  }

  private provider(subscriptionId: string) {
    return this.subscriptionService.getSubscriptionOrThrowUnscoped(subscriptionId);
  }

  private async apply(workspace: WorkspaceBilling, subscription: LemonSqueezySubscription) {
    const synced = await this.subscriptionService.syncSubscription(workspace, subscription);
    if (!synced) throw new Error("The workspace's billing binding changed while the event was processed");

    if (synced.changedPlan)
      await this.deleteAccountsForPlan.invoke({ companyId: synced.companyId, plan: synced.changedPlan });

    return { applied: true };
  }

  private async refuse(
    reason: BillingWebhookAlertReason,
    event: LemonSqueezyWebhookEvent,
    workspace: WorkspaceBilling | null,
    otherSubscriptionId: string | null = null,
  ) {
    await this.alert(reason, event, workspace, otherSubscriptionId);
    return { applied: false };
  }

  private async alert(
    reason: BillingWebhookAlertReason,
    event: LemonSqueezyWebhookEvent,
    workspace: WorkspaceBilling | null,
    otherSubscriptionId: string | null,
  ) {
    await this.emailService.send({
      to: env.RESEND_OPERATOR_EMAIL,
      subject: BILLING_WEBHOOK_ALERT_COPY[reason].subject,
      react: React.createElement(BillingWebhookAlert, {
        reason,
        eventName: event.eventName,
        subscriptionId: event.subscriptionId,
        workspaceId: workspace?.companyId ?? event.claim?.companyId ?? null,
        workspaceName: workspace?.name ?? null,
        otherSubscriptionId,
        layoutCopy: DEFAULT_EMAIL_LAYOUT_COPY,
        locale: DEFAULT_LOCALE,
      }),
    });
  }
}
