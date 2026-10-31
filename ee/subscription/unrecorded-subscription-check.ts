import type { EmailService } from "@/features/email/email.service";
import type { ProcessLemonSqueezyWebhookRepo } from "./process-lemon-squeezy-webhook.repo";
import type { LemonSqueezySubscription, SubscriptionService } from "./subscription.service";

import React from "react";
import * as ErrorReporter from "@/core/observability/server";

import BillingWebhookAlert from "@/components/emails/billing-webhook-alert";
import { BILLING_WEBHOOK_ALERT_COPY } from "@/components/emails/billing-webhook-alert-copy";
import { DEFAULT_EMAIL_LAYOUT_COPY } from "@/components/emails/base/email-layout-copy";
import { env } from "@/env";
import { DEFAULT_LOCALE } from "@/i18n/locale-registry";

import { variantToOffer } from "./lemon-squeezy-bindings";

export type UnrecordedSubscriptionOutcome = "none" | "found" | "unverified";

export type UnrecordedSubscriptionWorkspace = {
  companyId: string;
  name: string | null;
  checkoutStartedAt: Date;
  checkoutEmail: string | null;
};

type Provider = Pick<SubscriptionService, "listStoreSubscriptionsByEmailOrThrowUnscoped">;
type Bindings = Pick<ProcessLemonSqueezyWebhookRepo, "findWorkspaceBillingBySubscriptionIdUnscoped">;
type Mail = Pick<EmailService, "send">;

export const DELETION_ALERT_EVENT = "workspace_deletion";

function createdAt(subscription: LemonSqueezySubscription): number {
  const value = subscription.data.attributes.created_at;
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

function isOurVariant(subscription: LemonSqueezySubscription): boolean {
  const variantId = subscription.data.attributes.variant_id;
  return variantId != null && variantToOffer(String(variantId)) !== null;
}

export class UnrecordedSubscriptionCheck {
  constructor(
    private readonly provider: Provider,
    private readonly bindings: Bindings,
    private readonly mail: Mail,
  ) {}

  async findUnscoped(
    workspace: UnrecordedSubscriptionWorkspace,
    emails: string[],
  ): Promise<UnrecordedSubscriptionOutcome> {
    let unrecorded: LemonSqueezySubscription[];
    try {
      unrecorded = await this.findUnrecorded(workspace, emails);
    } catch (error) {
      ErrorReporter.captureException(error, {
        level: "warning",
        tags: { kind: "workspace-delete-billing-verification", companyId: workspace.companyId },
      });
      return "unverified";
    }
    if (unrecorded.length === 0) return "none";

    await this.alert(workspace, unrecorded);
    return "found";
  }

  private async findUnrecorded(
    workspace: UnrecordedSubscriptionWorkspace,
    emails: string[],
  ): Promise<LemonSqueezySubscription[]> {
    const addresses = new Set(
      [workspace.checkoutEmail, ...emails].flatMap((email) => (email ? [email.trim().toLowerCase()] : [])),
    );
    const listed = await Promise.all(
      [...addresses].map((email) => this.provider.listStoreSubscriptionsByEmailOrThrowUnscoped(email)),
    );
    const startedAt = workspace.checkoutStartedAt.getTime();
    const candidates = new Map(
      listed
        .flat()
        .filter(
          (subscription) =>
            subscription.data.attributes.status !== "expired" &&
            createdAt(subscription) >= startedAt &&
            isOurVariant(subscription),
        )
        .map((subscription) => [subscription.data.id, subscription]),
    );

    const unrecorded: LemonSqueezySubscription[] = [];
    for (const subscription of candidates.values()) {
      if (!(await this.bindings.findWorkspaceBillingBySubscriptionIdUnscoped(subscription.data.id)))
        unrecorded.push(subscription);
    }
    return unrecorded.sort((left, right) => createdAt(right) - createdAt(left));
  }

  private async alert(workspace: UnrecordedSubscriptionWorkspace, unrecorded: LemonSqueezySubscription[]) {
    const [newest, next] = unrecorded;
    const context = { tags: { kind: "workspace-delete-unrecorded-subscription", companyId: workspace.companyId } };
    try {
      const sent = await this.mail.send({
        to: env.RESEND_OPERATOR_EMAIL,
        subject: BILLING_WEBHOOK_ALERT_COPY.deletionBlocked.subject,
        react: React.createElement(BillingWebhookAlert, {
          reason: "deletionBlocked",
          eventName: DELETION_ALERT_EVENT,
          subscriptionId: newest.data.id,
          workspaceId: workspace.companyId,
          workspaceName: workspace.name,
          otherSubscriptionId: next?.data.id ?? null,
          layoutCopy: DEFAULT_EMAIL_LAYOUT_COPY,
          locale: DEFAULT_LOCALE,
        }),
      });
      if (!sent)
        ErrorReporter.captureMessage("Workspace deletion alert could not be sent", { level: "error", ...context });
    } catch (error) {
      ErrorReporter.captureException(error, context);
    }
  }
}
