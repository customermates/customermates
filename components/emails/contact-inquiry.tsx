import { EmailField } from "@/components/emails/base/email-field";
import { EmailLayout } from "@/components/emails/base/email-layout";
import { DEFAULT_EMAIL_LAYOUT_COPY, type EmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/locale-registry";

type Props = {
  name: string;
  email: string;
  company?: string;
  message: string;
  locale: AppLocale;
  layoutCopy: EmailLayoutCopy;
};

export default function ContactInquiry({ name, email, company, message, locale, layoutCopy }: Props) {
  const subject = "New contact inquiry";

  return (
    <EmailLayout layoutCopy={layoutCopy} locale={locale} preview={subject} title={subject}>
      <EmailField label="From">{`${name} (${email})`}</EmailField>

      {company ? <EmailField label="Company">{company}</EmailField> : null}

      <EmailField label="Message">{message}</EmailField>
    </EmailLayout>
  );
}

ContactInquiry.PreviewProps = {
  layoutCopy: DEFAULT_EMAIL_LAYOUT_COPY,
  locale: DEFAULT_LOCALE,
  name: "Jane Doe",
  email: "jane@example.com",
  company: "Acme Inc.",
  message: "Hi, I'd like to learn more about Customermates for my agency.",
};
