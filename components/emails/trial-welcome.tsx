import enMessages from "@/i18n/locales/en.json";
import { EmailLayout } from "@/components/emails/base/email-layout";
import { DEFAULT_EMAIL_LAYOUT_COPY, type EmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import { EmailText } from "@/components/emails/base/email-text";
import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/locale-registry";

type Props = {
  locale: AppLocale;
  layoutCopy: EmailLayoutCopy;
  greeting: string;
  body: string;
  planNote: string;
  dismiss: string;
  signoff: string;
  subject: string;
  title: string;
};

export default function TrialWelcome({
  locale,
  layoutCopy,
  greeting,
  body,
  planNote,
  dismiss,
  signoff,
  subject,
  title,
}: Props) {
  return (
    <EmailLayout layoutCopy={layoutCopy} locale={locale} preview={subject} title={title}>
      <EmailText>{greeting}</EmailText>

      <EmailText>{body}</EmailText>

      <EmailText>{planNote}</EmailText>

      <EmailText>{dismiss}</EmailText>

      <EmailText className="whitespace-pre-line">{signoff}</EmailText>
    </EmailLayout>
  );
}

const t = enMessages.TrialWelcome;
const previewFirstName = "Sofia";

TrialWelcome.PreviewProps = {
  layoutCopy: DEFAULT_EMAIL_LAYOUT_COPY,
  locale: DEFAULT_LOCALE,
  greeting: t.greeting.replace("{firstName}", previewFirstName),
  body: t.body,
  planNote: t.planNote,
  dismiss: t.dismiss,
  signoff: t.signoff,
  subject: t.subject,
  title: t.title,
};
