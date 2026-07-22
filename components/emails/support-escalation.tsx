import { EmailField } from "@/components/emails/base/email-field";
import { EmailLayout } from "@/components/emails/base/email-layout";

type Props = {
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
}: Props) {
  return (
    <EmailLayout preview={`Support request from ${userName}`} title="Support request">
      <EmailField label="From">{`${userName} (${userEmail})`}</EmailField>

      <EmailField label="Company">{companyName}</EmailField>

      <EmailField label="Conversation">{conversationTitle}</EmailField>

      <EmailField label="Recent messages">{lastMessages}</EmailField>
    </EmailLayout>
  );
}

SupportEscalation.PreviewProps = {
  userName: "Max Mustermann",
  userEmail: "max@example.com",
  companyName: "Acme GmbH",
  conversationTitle: "Import question",
  lastMessages: "user: How do I import contacts?",
};
