import { EmailField } from "@/components/emails/base/email-field";
import { EmailLayout } from "@/components/emails/base/email-layout";
import { PREVIEW_EMAIL_LAYOUT_COPY, type EmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/locale-registry";

type Props = {
  email: string;
  name: string;
  provider?: string;
  locale: AppLocale;
  layoutCopy: EmailLayoutCopy;
};

export default function NewUserNotification({ email, name, provider, locale, layoutCopy }: Props) {
  const subject = "New user registration";

  return (
    <EmailLayout layoutCopy={layoutCopy} locale={locale} preview={subject} title={subject}>
      <EmailField label="User">{`${name} (${email})`}</EmailField>

      {provider ? <EmailField label="Provider">{provider}</EmailField> : null}
    </EmailLayout>
  );
}

NewUserNotification.PreviewProps = {
  layoutCopy: PREVIEW_EMAIL_LAYOUT_COPY,
  locale: DEFAULT_LOCALE,
  email: "user@example.com",
  name: "John Doe",
  provider: "Google",
};
