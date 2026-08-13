import { EmailField } from "@/components/emails/base/email-field";
import { EmailLayout, type EmailLayoutSharedProps } from "@/components/emails/base/email-layout";
import { PREVIEW_EMAIL_LAYOUT_PROPS } from "@/components/emails/preview-layout-props";

type Props = EmailLayoutSharedProps & {
  userName: string;
  userEmail: string;
  companyName: string;
  conversationTitle: string;
  lastMessages: string;
};

export default function SupportEscalation({
  userName,
  userEmail,
  companyName,
  conversationTitle,
  lastMessages,
  ...layoutProps
}: Props) {
  return (
    <EmailLayout {...layoutProps} preview={`Support request from ${userName}`} title="Support request">
      <EmailField label="From">{`${userName} (${userEmail})`}</EmailField>

      <EmailField label="Company">{companyName}</EmailField>

      <EmailField label="Conversation">{conversationTitle}</EmailField>

      <EmailField label="Recent messages">{lastMessages}</EmailField>
    </EmailLayout>
  );
}

SupportEscalation.PreviewProps = {
  ...PREVIEW_EMAIL_LAYOUT_PROPS,
  userName: "Max Mustermann",
  userEmail: "max@example.com",
  companyName: "Acme GmbH",
  conversationTitle: "Import question",
  lastMessages: "user: How do I import contacts?",
} satisfies Props;
