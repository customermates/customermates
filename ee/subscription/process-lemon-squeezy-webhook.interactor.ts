import type { LemonSqueezySubscription, SubscriptionService } from "./subscription.service";
import type { ProcessLemonSqueezyWebhookRepo, WorkspaceBilling } from "./process-lemon-squeezy-webhook.repo";
import type { DeleteAccountsForPlanInteractor } from "@/ee/messaging/connect/delete-accounts-for-plan.interactor";
import type { EmailService } from "@/features/email/email.service";

import React from "react";
import * as Sentry from "@sentry/nextjs";

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
import { hasLiveSubscription } from "./entitlements";
import { acceptsUnsignedCheckoutClaim } from "./unsigned-checkout-claims";

type WorkspaceClaim = { companyId: string; signature: string | null };

export type LemonSqueezyWebhookEvent = {
  kind: "subscription" | "payment";
  eventName: string;
  subscriptionId: string;
  subscriptionCreatedAt: Date | null;
  claim: WorkspaceClaim | null;
};

export type LemonSqueezyWebhookOutcome = "applied" | "ignored" | "refused";

const LIVE_PROVIDER_STATUSES = new Set(["active", "on_trial", "past_due"]);
const PAYMENT_EVENTS = new Set(["subscription_created", "subscription_payment_success"]);

function createdAt(subscription: LemonSqueezySubscription): number {
  const value = subscription.data.attributes.created_at;
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

function isLive(subscription: LemonSqueezySubscription): boolean {
  return LIVE_PROVIDER_STATUSES.has(subscription.data.attributes.status);
}

function isForged(claim: WorkspaceClaim): boolean {
  return (
    claim.signature !== null && !isCheckoutWorkspaceSignature(claim.companyId, claim.signature, env.BETTER_AUTH_SECRET)
  );
}

@SystemInteractor
export class ProcessLemonSqueezyWebhookInteractor {
  constructor(
    private repo: ProcessLemonSqueezyWebhookRepo,
    private subscriptionService: SubscriptionService,
    private deleteAccountsForPlan: DeleteAccountsForPlanInteractor,
    private emailService: EmailService,
  ) {}

  async invoke(event: LemonSqueezyWebhookEvent): Promise<LemonSqueezyWebhookOutcome> {
    const bound = await this.repo.findWorkspaceBillingBySubscriptionIdUnscoped(event.subscriptionId);
    if (event.kind === "payment") return bound ? "ignored" : this.notePayment(event);
    if (bound) return this.apply(bound, await this.provider(event.subscriptionId));

    const { claim } = event;
    if (!claim) return this.refuse("unclaimed", event, null);

    const workspace = await this.repo.findWorkspaceBillingUnscoped(claim.companyId);
    if (workspace?.lemonSqueezyId === event.subscriptionId)
      return this.apply(workspace, await this.provider(event.subscriptionId));
    if (isForged(claim)) return this.refuse("forged", event, workspace);
    if (!workspace) return this.acknowledgeMissingWorkspace(event, claim);
    const signed = claim.signature !== null;
    if (!signed && !acceptsUnsignedCheckoutClaim(event.subscriptionCreatedAt))
      return this.refuse("unsigned", event, workspace);

    const [incoming, current] = await Promise.all([
      this.provider(event.subscriptionId),
      workspace.lemonSqueezyId ? this.provider(workspace.lemonSqueezyId) : null,
    ]);
    const newer = !current || createdAt(incoming) > createdAt(current);
    if (!newer && !isLive(incoming)) return "ignored";
    const live = hasLiveSubscription(workspace);
    if (newer && !live) return this.apply(workspace, incoming);
    if (!signed) return this.refuse("unsigned", event, workspace);
    if (newer && isLive(incoming))
      return this.apply(workspace, incoming, () => this.alert("replaced", event, workspace, workspace.lemonSqueezyId));

    return this.refuse("duplicate", event, workspace, workspace.lemonSqueezyId);
  }

  private provider(subscriptionId: string) {
    return this.subscriptionService.getSubscriptionOrThrowUnscoped(subscriptionId);
  }

  private async notePayment(event: LemonSqueezyWebhookEvent) {
    const { claim } = event;
    if (!claim || isForged(claim)) return "ignored" as const;
    if (await this.repo.findWorkspaceBillingUnscoped(claim.companyId)) return "ignored" as const;

    return this.acknowledgeMissingWorkspace(event, claim);
  }

  private async acknowledgeMissingWorkspace(event: LemonSqueezyWebhookEvent, claim: WorkspaceClaim) {
    if (PAYMENT_EVENTS.has(event.eventName)) {
      await this.alert("workspaceMissing", event, null, null);
      return "ignored" as const;
    }

    Sentry.captureMessage("Lemon Squeezy event for a missing workspace acknowledged without changes", {
      level: "info",
      tags: { eventName: event.eventName, subscriptionId: event.subscriptionId, companyId: claim.companyId },
    });
    return "ignored" as const;
  }

  private async apply(
    workspace: WorkspaceBilling,
    subscription: LemonSqueezySubscription,
    announce?: () => Promise<void>,
  ) {
    const synced = await this.subscriptionService.syncSubscription(workspace, subscription);
    if (!synced) throw new Error("The workspace's billing binding changed while the event was processed");

    await announce?.();
    if (synced.changedPlan)
      await this.deleteAccountsForPlan.invoke({ companyId: synced.companyId, plan: synced.changedPlan });

    return "applied" as const;
  }

  private async refuse(
    reason: BillingWebhookAlertReason,
    event: LemonSqueezyWebhookEvent,
    workspace: WorkspaceBilling | null,
    otherSubscriptionId: string | null = null,
  ) {
    await this.alert(reason, event, workspace, otherSubscriptionId);
    return "refused" as const;
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
