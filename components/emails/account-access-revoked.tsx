import enMessages from "@/i18n/locales/en.json";
import { EmailButton } from "@/components/emails/base/email-button";
import { EmailLayout, type EmailLayoutSharedProps } from "@/components/emails/base/email-layout";
import { EmailSection } from "@/components/emails/base/email-section";
import { EmailText } from "@/components/emails/base/email-text";
import { PREVIEW_EMAIL_LAYOUT_PROPS } from "@/components/emails/preview-layout-props";
import { env } from "@/env";

const FORGOT_PASSWORD_HREF = `${env.BASE_URL}/auth/forgot-password`;

type Props = EmailLayoutSharedProps & {
  greeting: string;
  body: string;
  cta: string;
  signoff: string;
  subject: string;
  title: string;
  href?: string;
};

export default function AccountAccessRevoked({
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
        <EmailButton href={href ?? FORGOT_PASSWORD_HREF}>{cta}</EmailButton>
      </EmailSection>

      <EmailText className="text-sm text-default-700">{signoff}</EmailText>
    </EmailLayout>
  );
}

const t = enMessages.AccountAccessRevoked;

AccountAccessRevoked.PreviewProps = {
  ...PREVIEW_EMAIL_LAYOUT_PROPS,
  greeting: t.greeting,
  body: t.body,
  cta: t.cta,
  signoff: t.signoff,
  subject: t.subject,
  title: t.title,
  href: FORGOT_PASSWORD_HREF,
} satisfies Props;
