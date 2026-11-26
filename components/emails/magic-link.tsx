import enMessages from "@/i18n/locales/en.json";
import { EmailButton } from "@/components/emails/base/email-button";
import { EmailLayout, type EmailLayoutSharedProps } from "@/components/emails/base/email-layout";
import { EmailLink } from "@/components/emails/base/email-link";
import { EmailSection } from "@/components/emails/base/email-section";
import { EmailText } from "@/components/emails/base/email-text";
import { PREVIEW_EMAIL_LAYOUT_PROPS } from "@/components/emails/preview-layout-props";

type Props = EmailLayoutSharedProps & {
  url: string;
  subject: string;
  intro: string;
  cta: string;
  expiry: string;
  fallback: string;
  securityNotice: string;
};

export default function MagicLinkEmail({
  url,
  subject,
  intro,
  cta,
  expiry,
  fallback,
  securityNotice,
  ...layoutProps
}: Props) {
  return (
    <EmailLayout {...layoutProps} preview={subject} title={subject}>
      <EmailText>{intro}</EmailText>

      <EmailSection>
        <EmailButton href={url}>{cta}</EmailButton>
      </EmailSection>

      <EmailText className="text-sm text-default-700">{expiry}</EmailText>

      <EmailText className="text-sm text-default-700">{securityNotice}</EmailText>

      <EmailText className="text-sm text-default-700">
        {fallback}

        <EmailLink href={url}>{url}</EmailLink>
      </EmailText>
    </EmailLayout>
  );
}

const t = enMessages.MagicLinkEmail;

MagicLinkEmail.PreviewProps = {
  ...PREVIEW_EMAIL_LAYOUT_PROPS,
  url: "https://example.com/api/auth/magic-link/verify?token=TEST",
  subject: t.subject,
  intro: t.intro,
  cta: t.cta,
  expiry: t.expiry,
  fallback: t.fallback,
  securityNotice: t.securityNotice,
} satisfies Props;
