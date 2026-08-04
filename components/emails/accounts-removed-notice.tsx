import enMessages from "@/i18n/locales/en.json";
import { EmailButton } from "@/components/emails/base/email-button";
import { EmailLayout } from "@/components/emails/base/email-layout";
import { EmailSection } from "@/components/emails/base/email-section";
import { EmailText } from "@/components/emails/base/email-text";
import { env } from "@/env";

const CONNECTED_ACCOUNTS_HREF = `${env.BASE_URL}/profile/connected-accounts`;

type Props = {
  locale: string;
  greeting: string;
  body: string;
  cta: string;
  signoff: string;
  subject: string;
  title: string;
  href?: string;
};

export default function AccountsRemovedNotice({ locale, greeting, body, cta, signoff, subject, title, href }: Props) {
  return (
    <EmailLayout locale={locale} preview={subject} title={title}>
      <EmailText>{greeting}</EmailText>

      <EmailText>{body}</EmailText>

      <EmailSection>
        <EmailButton href={href ?? CONNECTED_ACCOUNTS_HREF}>{cta}</EmailButton>
      </EmailSection>

      <EmailText className="whitespace-pre-line">{signoff}</EmailText>
    </EmailLayout>
  );
}

const t = enMessages.AccountsRemovedNotice;
const previewFirstName = "Sofia";
const previewAccounts = "LinkedIn (Jane Doe), Gmail (jane@company.com)";
const previewPlan = "Pro";

AccountsRemovedNotice.PreviewProps = {
  greeting: t.greeting.replace("{firstName}", previewFirstName),
  body: t.body.replace("{accounts}", previewAccounts).replace("{plan}", previewPlan),
  cta: t.cta,
  signoff: t.signoff,
  subject: t.subject,
  title: t.title,
  href: CONNECTED_ACCOUNTS_HREF,
};
