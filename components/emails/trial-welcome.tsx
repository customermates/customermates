import enMessages from "@/i18n/locales/en.json";
import { EmailLayout } from "@/components/emails/base/email-layout";
import { EmailLink } from "@/components/emails/base/email-link";
import { EmailText } from "@/components/emails/base/email-text";
const CONTACT_HREF_EN = "https://customermates.com/en/contact";
const CONTACT_HREF_DE = "https://customermates.com/de/contact";

type Props = {
  greeting: string;
  body: string;
  dismiss: string;
  scheduleFallback: string;
  signoff: string;
  subject: string;
  title: string;
  href?: string;
};

export default function TrialWelcome({
  greeting,
  body,
  dismiss,
  scheduleFallback,
  signoff,
  subject,
  title,
  href,
}: Props) {
  const resolvedHref = href ?? CONTACT_HREF_EN;
  const shouldRenderFallbackLink = resolvedHref === CONTACT_HREF_EN || resolvedHref === CONTACT_HREF_DE;

  return (
    <EmailLayout preview={subject} title={title}>
      <EmailText>{greeting}</EmailText>

      <EmailText>{body}</EmailText>

      <EmailText>{dismiss}</EmailText>

      {shouldRenderFallbackLink ? (
        <EmailText>
          {scheduleFallback}

          <EmailLink href={resolvedHref}>{resolvedHref}</EmailLink>
        </EmailText>
      ) : null}

      <EmailText>{signoff}</EmailText>
    </EmailLayout>
  );
}

const welcomeTranslations = enMessages.TrialWelcome;
const previewFirstName = "Sofia";

TrialWelcome.PreviewProps = {
  greeting: welcomeTranslations.greeting.replace("{firstName}", previewFirstName),
  body: welcomeTranslations.body,
  dismiss: welcomeTranslations.dismiss,
  scheduleFallback: welcomeTranslations.scheduleFallback,
  signoff: welcomeTranslations.signoff,
  subject: welcomeTranslations.subject,
  title: welcomeTranslations.title,
  href: CONTACT_HREF_EN,
};
