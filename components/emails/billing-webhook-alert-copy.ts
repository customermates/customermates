export type BillingWebhookAlertReason =
  | "unclaimed"
  | "unsigned"
  | "forged"
  | "workspaceMissing"
  | "duplicate"
  | "replaced";

type AlertCopy = { subject: string; summary: string; action: string; subscription: string; other: string };

export const BILLING_WEBHOOK_ALERT_FIELDS = {
  event: "Event",
  workspace: "Workspace",
  noWorkspace: "None named",
  action: "What to do",
};

export const BILLING_WEBHOOK_ALERT_COPY: Record<BillingWebhookAlertReason, AlertCopy> = {
  unclaimed: {
    subject: "Lemon Squeezy subscription without a workspace",
    summary: "An event arrived for a subscription that no workspace holds, and it names no workspace. Nothing changed.",
    action: "Find the customer in Lemon Squeezy, then bind the subscription in the operator console or refund it.",
    subscription: "Subscription",
    other: "Bound subscription",
  },
  unsigned: {
    subject: "Unsigned workspace in a Lemon Squeezy subscription",
    summary:
      "An event names a workspace without the checkout signature, and the transition rule does not apply. Nothing changed.",
    action:
      "Check the customer and the workspace. Bind the subscription in the operator console if it is genuine, otherwise refund it.",
    subscription: "Subscription",
    other: "Bound subscription",
  },
  forged: {
    subject: "Forged workspace in a Lemon Squeezy subscription",
    summary: "An event names a workspace with a signature that does not match. Nothing changed.",
    action: "Treat the subscription as suspicious and check it in Lemon Squeezy before you bind or refund it.",
    subscription: "Subscription",
    other: "Bound subscription",
  },
  workspaceMissing: {
    subject: "Lemon Squeezy payment for a missing workspace",
    summary:
      "Lemon Squeezy took a payment for a subscription whose workspace does not exist, for example one that was deleted. Nothing changed. Events of this subscription that take no payment are acknowledged without an e-mail.",
    action: "Cancel the subscription in Lemon Squeezy and refund the payment. Nothing was cancelled automatically.",
    subscription: "Subscription",
    other: "Bound subscription",
  },
  duplicate: {
    subject: "Second subscription for a workspace",
    summary: "The workspace keeps its live subscription, so this one stays unbound. Nothing changed.",
    action: "Cancel this subscription in Lemon Squeezy and refund it. Nothing was cancelled automatically.",
    subscription: "Subscription to cancel or refund",
    other: "Subscription the workspace keeps",
  },
  replaced: {
    subject: "Workspace moved to its newest subscription",
    summary:
      "A newer paid subscription arrived for a workspace that already had a live one. The workspace now uses the newer subscription.",
    action: "Cancel the previous subscription in Lemon Squeezy and refund it. Nothing was cancelled automatically.",
    subscription: "New subscription, now bound",
    other: "Previous subscription to cancel or refund",
  },
};
