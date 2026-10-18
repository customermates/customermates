import { EmailField } from "@/components/emails/base/email-field";
import { EmailLayout, type EmailLayoutSharedProps } from "@/components/emails/base/email-layout";
import { EmailText } from "@/components/emails/base/email-text";
import { PREVIEW_EMAIL_LAYOUT_PROPS } from "@/components/emails/preview-layout-props";
import {
  BILLING_WEBHOOK_ALERT_COPY,
  BILLING_WEBHOOK_ALERT_FIELDS,
  type BillingWebhookAlertReason,
} from "@/components/emails/billing-webhook-alert-copy";

type Props = EmailLayoutSharedProps & {
  reason: BillingWebhookAlertReason;
  eventName: string;
  subscriptionId: string;
  workspaceId: string | null;
  workspaceName: string | null;
  otherSubscriptionId: string | null;
};

export default function BillingWebhookAlert({
  reason,
  eventName,
  subscriptionId,
  workspaceId,
  workspaceName,
  otherSubscriptionId,
  ...layoutProps
}: Props) {
  const copy = BILLING_WEBHOOK_ALERT_COPY[reason];
  const workspace = workspaceId
    ? workspaceName
      ? `${workspaceName} (${workspaceId})`
      : workspaceId
    : BILLING_WEBHOOK_ALERT_FIELDS.noWorkspace;

  return (
    <EmailLayout {...layoutProps} preview={copy.subject} title={copy.subject}>
      <EmailText>{copy.summary}</EmailText>

      <EmailField label={BILLING_WEBHOOK_ALERT_FIELDS.event}>{eventName}</EmailField>

      <EmailField label={copy.subscription}>{subscriptionId}</EmailField>

      {otherSubscriptionId ? <EmailField label={copy.other}>{otherSubscriptionId}</EmailField> : null}

      <EmailField label={BILLING_WEBHOOK_ALERT_FIELDS.workspace}>{workspace}</EmailField>

      <EmailField label={BILLING_WEBHOOK_ALERT_FIELDS.action}>{copy.action}</EmailField>
    </EmailLayout>
  );
}

BillingWebhookAlert.PreviewProps = {
  ...PREVIEW_EMAIL_LAYOUT_PROPS,
  reason: "replaced",
  eventName: "subscription_created",
  subscriptionId: "200000002",
  workspaceId: "00000000-0000-4000-8000-000000000001",
  workspaceName: "Hoffmann Consulting",
  otherSubscriptionId: "100000001",
} satisfies Props;
