import enMessages from "@/i18n/locales/en.json";
import { EmailButton } from "@/components/emails/base/email-button";
import { EmailLayout } from "@/components/emails/base/email-layout";
import { EmailLink } from "@/components/emails/base/email-link";
import { EmailSection } from "@/components/emails/base/email-section";
import { EmailText } from "@/components/emails/base/email-text";
import { env } from "@/env";

const CONTACT_HREF = `${env.BASE_URL}/contact`;

type Props = {
  greeting: string;
  body: string;
  cta: string;
  scheduleFallback: string;
  signoff: string;
  subject: string;
  title: string;
  href?: string;
};

export default function TrialExpiredOffer({
  greeting,
  body,
  cta,
  scheduleFallback,
  signoff,
  subject,
  title,
  href,
}: Props) {
  const resolvedHref = href ?? CONTACT_HREF;

  return (
    <EmailLayout preview={subject} title={title}>
      <EmailText>{greeting}</EmailText>

      <EmailText>{body}</EmailText>

      <EmailSection>
        <EmailButton href={resolvedHref}>{cta}</EmailButton>
      </EmailSection>

      <EmailText className="text-sm text-default-700">
        {scheduleFallback}

        <EmailLink href={resolvedHref}>{resolvedHref}</EmailLink>
      </EmailText>

      <EmailText className="whitespace-pre-line">{signoff}</EmailText>
    </EmailLayout>
  );
}

const t = enMessages.TrialExpiredOffer;
const previewFirstName = "Sofia";

TrialExpiredOffer.PreviewProps = {
  greeting: t.greeting.replace("{firstName}", previewFirstName),
  body: t.body,
  cta: t.cta,
  scheduleFallback: t.scheduleFallback,
  signoff: t.signoff,
  subject: t.subject,
  title: t.title,
  href: CONTACT_HREF,
};
