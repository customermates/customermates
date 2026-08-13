import enMessages from "@/i18n/locales/en.json";
import { EmailButton } from "@/components/emails/base/email-button";
import { EmailLayout, type EmailLayoutSharedProps } from "@/components/emails/base/email-layout";
import { EmailSection } from "@/components/emails/base/email-section";
import { EmailText } from "@/components/emails/base/email-text";
import { PREVIEW_EMAIL_LAYOUT_PROPS } from "@/components/emails/preview-layout-props";
import { env } from "@/env";

const CONNECTED_ACCOUNTS_HREF = `${env.BASE_URL}/profile/connected-accounts`;

type Props = EmailLayoutSharedProps & {
  greeting: string;
  body: string;
  cta: string;
  signoff: string;
  subject: string;
  title: string;
  href?: string;
};

export default function AccountsRemovedNotice({
  greeting,
  body,
  cta,
  signoff,
  subject,
  title,
  href,
  ...layoutProps
}: Props) {
  return (
    <EmailLayout {...layoutProps} preview={subject} title={title}>
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
  ...PREVIEW_EMAIL_LAYOUT_PROPS,
  greeting: t.greeting.replace("{firstName}", previewFirstName),
  body: t.body.replace("{accounts}", previewAccounts).replace("{plan}", previewPlan),
  cta: t.cta,
  signoff: t.signoff,
  subject: t.subject,
  title: t.title,
  href: CONNECTED_ACCOUNTS_HREF,
} satisfies Props;
