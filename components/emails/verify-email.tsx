import enMessages from "@/i18n/locales/en.json";
import { EmailLayout, type EmailLayoutSharedProps } from "@/components/emails/base/email-layout";
import { EmailSection } from "@/components/emails/base/email-section";
import { EmailText } from "@/components/emails/base/email-text";
import { PREVIEW_EMAIL_LAYOUT_PROPS } from "@/components/emails/preview-layout-props";

type Props = EmailLayoutSharedProps & {
  code: string;
  subject: string;
  title: string;
  intro: string;
  expiry: string;
  securityNotice: string;
};

export default function VerifyEmail({ code, subject, title, intro, expiry, securityNotice, ...layoutProps }: Props) {
  return (
    <EmailLayout {...layoutProps} preview={subject} title={title}>
      <EmailText>{intro}</EmailText>

      <EmailSection>
        <EmailText className="m-0 font-mono text-3xl leading-10 font-semibold tracking-widest text-default-900">
          {code}
        </EmailText>
      </EmailSection>

      <EmailText className="text-sm text-default-700">{expiry}</EmailText>

      <EmailText className="text-sm text-default-700">{securityNotice}</EmailText>
    </EmailLayout>
  );
}

const t = enMessages.VerifyEmail;
const PREVIEW_CODE = "482913";

VerifyEmail.PreviewProps = {
  ...PREVIEW_EMAIL_LAYOUT_PROPS,
  code: PREVIEW_CODE,
  subject: t.subject.replace("{code}", PREVIEW_CODE),
  title: t.title,
  intro: t.intro,
  expiry: t.expiry.replace("{minutes}", "15"),
  securityNotice: t.securityNotice,
} satisfies Props;
