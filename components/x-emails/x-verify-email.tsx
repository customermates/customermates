import enMessages from "@/i18n/locales/en.json";
import { XEmailButton } from "@/components/x-emails/base/x-email-button";
import { XEmailLayout } from "@/components/x-emails/base/x-email-layout";
import { XEmailLink } from "@/components/x-emails/base/x-email-link";
import { XEmailSection } from "@/components/x-emails/base/x-email-section";
import { XEmailText } from "@/components/x-emails/base/x-email-text";

type Props = {
  url: string;
  subject: string;
  intro: string;
  fallback: string;
  securityNotice: string;
};

export default function XVerifyEmail({ url, subject, intro, fallback, securityNotice }: Props) {
  return (
    <XEmailLayout preview={subject} title={subject}>
      <XEmailText>{intro}</XEmailText>

      <XEmailSection>
        <XEmailButton href={url}>{subject}</XEmailButton>
      </XEmailSection>

      <XEmailText>{securityNotice}</XEmailText>

      <XEmailText>
        {fallback}

        <XEmailLink href={url}>{url}</XEmailLink>
      </XEmailText>
    </XEmailLayout>
  );
}

const verifyEmailTranslations = enMessages.VerifyEmail;

XVerifyEmail.PreviewProps = {
  url: "https://example.com/auth/verify?token=TEST",
  subject: verifyEmailTranslations.subject,
  intro: verifyEmailTranslations.intro,
  fallback: verifyEmailTranslations.fallback,
  securityNotice: verifyEmailTranslations.securityNotice,
};
