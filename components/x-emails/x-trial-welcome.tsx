import enMessages from "@/i18n/locales/en.json";
import { XEmailLayout } from "@/components/x-emails/base/x-email-layout";
import { XEmailLink } from "@/components/x-emails/base/x-email-link";
import { XEmailText } from "@/components/x-emails/base/x-email-text";
const DEMO_HREF_EN = "https://calendly.com/customermates/product-demo";
const DEMO_HREF_DE = "https://calendly.com/customermates/produkt-demo";

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

export default function XTrialWelcome({
  greeting,
  body,
  dismiss,
  scheduleFallback,
  signoff,
  subject,
  title,
  href,
}: Props) {
  const resolvedHref = href ?? DEMO_HREF_EN;
  const shouldRenderFallbackLink = resolvedHref === DEMO_HREF_EN || resolvedHref === DEMO_HREF_DE;

  return (
    <XEmailLayout preview={subject} title={title}>
      <XEmailText>{greeting}</XEmailText>

      <XEmailText>{body}</XEmailText>

      <XEmailText>{dismiss}</XEmailText>

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

const welcomeTranslations = enMessages.TrialWelcome;
const previewFirstName = "Sofia";

XTrialWelcome.PreviewProps = {
  greeting: welcomeTranslations.greeting.replace("{firstName}", previewFirstName),
  body: welcomeTranslations.body,
  dismiss: welcomeTranslations.dismiss,
  scheduleFallback: welcomeTranslations.scheduleFallback,
  signoff: welcomeTranslations.signoff,
  subject: welcomeTranslations.subject,
  title: welcomeTranslations.title,
  href: DEMO_HREF_EN,
};
