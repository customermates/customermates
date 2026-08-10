import enMessages from "@/i18n/locales/en.json";
import { EmailButton } from "@/components/emails/base/email-button";
import { EmailLayout } from "@/components/emails/base/email-layout";
import { DEFAULT_EMAIL_LAYOUT_COPY, type EmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import { EmailLink } from "@/components/emails/base/email-link";
import { EmailSection } from "@/components/emails/base/email-section";
import { EmailText } from "@/components/emails/base/email-text";
import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/locale-registry";
import { env } from "@/env";

type Props = {
  locale: AppLocale;
  layoutCopy: EmailLayoutCopy;
  inviteLink: string;
  subject: string;
  preview: string;
  intro: string;
  cta: string;
  fallback: string;
};

export default function CompanyInvite({
  locale,
  layoutCopy,
  inviteLink,
  subject,
  preview,
  intro,
  cta,
  fallback,
}: Props) {
  return (
    <EmailLayout layoutCopy={layoutCopy} locale={locale} preview={preview} title={subject}>
      <EmailText>{intro}</EmailText>

      <EmailSection>
        <EmailButton href={inviteLink}>{cta}</EmailButton>
      </EmailSection>

      <EmailText className="text-sm text-default-700">
        {fallback}

        <EmailLink href={inviteLink}>{inviteLink}</EmailLink>
      </EmailText>
    </EmailLayout>
  );
}

const t = enMessages.CompanyInvite;
const previewInviterName = "Anna Müller";

CompanyInvite.PreviewProps = {
  layoutCopy: DEFAULT_EMAIL_LAYOUT_COPY,
  locale: DEFAULT_LOCALE,
  inviteLink: `${env.BASE_URL}/invitation/example-token`,
  subject: t.subject,
  preview: t.preview.replace("{inviterName}", previewInviterName),
  intro: t.intro.replace("{inviterName}", previewInviterName),
  cta: t.cta,
  fallback: t.fallback,
};
