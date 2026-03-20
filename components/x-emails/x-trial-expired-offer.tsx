import enMessages from "@/i18n/locales/en.json";
import { XEmailLayout } from "@/components/x-emails/base/x-email-layout";
import { XEmailLink } from "@/components/x-emails/base/x-email-link";
import { XEmailText } from "@/components/x-emails/base/x-email-text";
const DEMO_HREF_EN = "https://calendly.com/customermates/product-demo";
const DEMO_HREF_DE = "https://calendly.com/customermates/produkt-demo";

type Props = {
  greeting: string;
  body: string;
  scheduleFallback: string;
  signoff: string;
  subject: string;
  title: string;
  href?: string;
};

export default function XTrialExpiredOffer({ greeting, body, scheduleFallback, signoff, subject, title, href }: Props) {
  const resolvedHref = href ?? DEMO_HREF_EN;
  const shouldRenderFallbackLink = resolvedHref === DEMO_HREF_EN || resolvedHref === DEMO_HREF_DE;

  return (
    <XEmailLayout preview={subject} title={title}>
      <XEmailText>{greeting}</XEmailText>

      <XEmailText>{body}</XEmailText>

      {shouldRenderFallbackLink ? (
        <XEmailText>
          {scheduleFallback}

          <XEmailLink href={resolvedHref}>{resolvedHref}</XEmailLink>
        </XEmailText>
      ) : null}

      <XEmailText>{signoff}</XEmailText>
    </XEmailLayout>
  );
}

const offerTranslations = enMessages.TrialExpiredOffer;
const previewFirstName = "Sofia";

XTrialExpiredOffer.PreviewProps = {
  greeting: offerTranslations.greeting.replace("{firstName}", previewFirstName),
  body: offerTranslations.body,
  scheduleFallback: offerTranslations.scheduleFallback,
  signoff: offerTranslations.signoff,
  subject: offerTranslations.subject,
  title: offerTranslations.title,
  href: DEMO_HREF_EN,
};
