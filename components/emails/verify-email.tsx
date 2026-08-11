import enMessages from "@/i18n/locales/en.json";
import { EmailButton } from "@/components/emails/base/email-button";
import { EmailLayout } from "@/components/emails/base/email-layout";
import { PREVIEW_EMAIL_LAYOUT_COPY, type EmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import { EmailLink } from "@/components/emails/base/email-link";
import { EmailSection } from "@/components/emails/base/email-section";
import { EmailText } from "@/components/emails/base/email-text";
import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/locale-registry";

type Props = {
  locale: AppLocale;
  layoutCopy: EmailLayoutCopy;
  url: string;
  subject: string;
  intro: string;
  cta: string;
  fallback: string;
  securityNotice: string;
};

export default function VerifyEmail({ locale, layoutCopy, url, subject, intro, cta, fallback, securityNotice }: Props) {
  return (
    <EmailLayout layoutCopy={layoutCopy} locale={locale} preview={subject} title={subject}>
      <EmailText>{intro}</EmailText>

      <EmailSection>
        <EmailButton href={url}>{cta}</EmailButton>
      </EmailSection>

      <EmailText className="text-sm text-default-700">{securityNotice}</EmailText>

      <EmailText className="text-sm text-default-700">
        {fallback}

        <EmailLink href={url}>{url}</EmailLink>
      </EmailText>
    </EmailLayout>
  );
}

const t = enMessages.VerifyEmail;

VerifyEmail.PreviewProps = {
  layoutCopy: PREVIEW_EMAIL_LAYOUT_COPY,
  locale: DEFAULT_LOCALE,
  url: "https://example.com/auth/verify?token=TEST",
  subject: t.subject,
  intro: t.intro,
  cta: t.cta,
  fallback: t.fallback,
  securityNotice: t.securityNotice,
};
