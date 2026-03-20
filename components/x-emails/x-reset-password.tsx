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

export default function XResetPassword({ url, subject, intro, fallback, securityNotice }: Props) {
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

const resetPasswordTranslations = enMessages.ResetPassword;

XResetPassword.PreviewProps = {
  url: "https://example.com/auth/reset?token=TEST",
  subject: resetPasswordTranslations.subject,
  intro: resetPasswordTranslations.intro,
  fallback: resetPasswordTranslations.fallback,
  securityNotice: resetPasswordTranslations.securityNotice,
};
