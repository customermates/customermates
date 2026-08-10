import { EmailField } from "@/components/emails/base/email-field";
import { EmailLayout } from "@/components/emails/base/email-layout";
import { DEFAULT_EMAIL_LAYOUT_COPY, type EmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/locale-registry";

type Props = {
  feedback: string;
  userEmail: string;
  userName: string;
  subject: string;
  locale: AppLocale;
  layoutCopy: EmailLayoutCopy;
};

export default function Feedback({ feedback, userEmail, userName, subject, locale, layoutCopy }: Props) {
  return (
    <EmailLayout layoutCopy={layoutCopy} locale={locale} preview={subject} title={subject}>
      <EmailField label="From">{`${userName} (${userEmail})`}</EmailField>

      <EmailField label="Type">{subject}</EmailField>

      <EmailField label="Feedback">{feedback}</EmailField>
    </EmailLayout>
  );
}

Feedback.PreviewProps = {
  layoutCopy: DEFAULT_EMAIL_LAYOUT_COPY,
  locale: DEFAULT_LOCALE,
  feedback: "The CRM is working great! I found it very helpful for managing my contacts.",
  userEmail: "user@example.com",
  userName: "John Doe",
  subject: "Product Feedback",
};
