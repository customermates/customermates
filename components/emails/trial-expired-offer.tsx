import enMessages from "@/i18n/locales/en.json";
import { EmailLayout } from "@/components/emails/base/email-layout";
import { EmailLink } from "@/components/emails/base/email-link";
import { EmailText } from "@/components/emails/base/email-text";
const CONTACT_HREF_EN = "https://customermates.com/en/contact";
const CONTACT_HREF_DE = "https://customermates.com/de/contact";

type Props = {
  greeting: string;
  body: string;
  scheduleFallback: string;
  signoff: string;
  subject: string;
  title: string;
  href?: string;
};

export default function TrialExpiredOffer({ greeting, body, scheduleFallback, signoff, subject, title, href }: Props) {
  const resolvedHref = href ?? CONTACT_HREF_EN;
  const shouldRenderFallbackLink = resolvedHref === CONTACT_HREF_EN || resolvedHref === CONTACT_HREF_DE;

  return (
    <EmailLayout preview={subject} title={title}>
      <EmailText>{greeting}</EmailText>

      <EmailText>{body}</EmailText>

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

const offerTranslations = enMessages.TrialExpiredOffer;
const previewFirstName = "Sofia";

TrialExpiredOffer.PreviewProps = {
  greeting: offerTranslations.greeting.replace("{firstName}", previewFirstName),
  body: offerTranslations.body,
  scheduleFallback: offerTranslations.scheduleFallback,
  signoff: offerTranslations.signoff,
  subject: offerTranslations.subject,
  title: offerTranslations.title,
  href: CONTACT_HREF_EN,
};
