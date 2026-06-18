import enMessages from "@/i18n/locales/en.json";
import { EmailButton } from "@/components/emails/base/email-button";
import { EmailLayout } from "@/components/emails/base/email-layout";
import { EmailLink } from "@/components/emails/base/email-link";
import { EmailSection } from "@/components/emails/base/email-section";
import { EmailText } from "@/components/emails/base/email-text";
import { env } from "@/env";

type Props = {
  inviteLink: string;
  subject: string;
  preview: string;
  intro: string;
  cta: string;
  fallback: string;
};

export default function CompanyInvite({ inviteLink, subject, preview, intro, cta, fallback }: Props) {
  return (
    <EmailLayout preview={preview} title={subject}>
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
const previewCompanyName = "Acme Inc.";
const previewInviterName = "Anna Müller";

CompanyInvite.PreviewProps = {
  inviteLink: `${env.BASE_URL}/invitation/example-token`,
  subject: t.subject.replace("{companyName}", previewCompanyName),
  preview: t.preview.replace("{inviterName}", previewInviterName).replace("{companyName}", previewCompanyName),
  intro: t.intro.replace("{inviterName}", previewInviterName),
  cta: t.cta,
  fallback: t.fallback,
};
