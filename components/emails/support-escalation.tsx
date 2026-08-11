import { EmailField } from "@/components/emails/base/email-field";
import { EmailLayout } from "@/components/emails/base/email-layout";
import { PREVIEW_EMAIL_LAYOUT_COPY, type EmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/locale-registry";

type Props = {
  userName: string;
  userEmail: string;
  companyName: string;
  conversationTitle: string;
  lastMessages: string;
  locale: AppLocale;
  layoutCopy: EmailLayoutCopy;
};

export default function SupportEscalation({
  userName,
  userEmail,
  companyName,
  conversationTitle,
  lastMessages,
  locale,
  layoutCopy,
}: Props) {
  return (
    <EmailLayout
      layoutCopy={layoutCopy}
      locale={locale}
      preview={`Support request from ${userName}`}
      title="Support request"
    >
      <EmailField label="From">{`${userName} (${userEmail})`}</EmailField>

      <EmailField label="Company">{companyName}</EmailField>

      <EmailField label="Conversation">{conversationTitle}</EmailField>

      <EmailField label="Recent messages">{lastMessages}</EmailField>
    </EmailLayout>
  );
}

SupportEscalation.PreviewProps = {
  layoutCopy: PREVIEW_EMAIL_LAYOUT_COPY,
  locale: DEFAULT_LOCALE,
  userName: "Max Mustermann",
  userEmail: "max@example.com",
  companyName: "Acme GmbH",
  conversationTitle: "Import question",
  lastMessages: "user: How do I import contacts?",
};
