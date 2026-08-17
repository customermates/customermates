import enMessages from "@/i18n/locales/en.json";
import { EmailButton } from "@/components/emails/base/email-button";
import { EmailLayout, type EmailLayoutSharedProps } from "@/components/emails/base/email-layout";
import { EmailLink } from "@/components/emails/base/email-link";
import { EmailSection } from "@/components/emails/base/email-section";
import { EmailText } from "@/components/emails/base/email-text";
import { PREVIEW_EMAIL_LAYOUT_PROPS } from "@/components/emails/preview-layout-props";
import { env } from "@/env";

type Props = EmailLayoutSharedProps & {
  inviteLink: string;
  subject: string;
  preview: string;
  intro: string;
  cta: string;
  fallback: string;
};

export default function CompanyInvite({ inviteLink, subject, preview, intro, cta, fallback, ...layoutProps }: Props) {
  return (
    <EmailLayout {...layoutProps} preview={preview} title={subject}>
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
  ...PREVIEW_EMAIL_LAYOUT_PROPS,
  inviteLink: `${env.BASE_URL}/invitation/example-token`,
  subject: t.subject,
  preview: t.preview.replace("{inviterName}", previewInviterName),
  intro: t.intro.replace("{inviterName}", previewInviterName),
  cta: t.cta,
  fallback: t.fallback,
} satisfies Props;
