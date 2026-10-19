import enMessages from "@/i18n/locales/en.json";
import { EmailButton } from "@/components/emails/base/email-button";
import { EmailLayout, type EmailLayoutSharedProps } from "@/components/emails/base/email-layout";
import { EmailLink } from "@/components/emails/base/email-link";
import { EmailSection } from "@/components/emails/base/email-section";
import { EmailText } from "@/components/emails/base/email-text";
import { PREVIEW_EMAIL_LAYOUT_PROPS } from "@/components/emails/preview-layout-props";

type Props = EmailLayoutSharedProps & {
  greeting: string;
  body: string;
  cta: string;
  fallback: string;
  subject: string;
  title: string;
  href: string;
};

export default function WorkspaceSetupNotice({
  greeting,
  body,
  cta,
  fallback,
  subject,
  title,
  href,
  ...layoutProps
}: Props) {
  return (
    <EmailLayout {...layoutProps} preview={subject} title={title}>
      <EmailText>{greeting}</EmailText>

      <EmailText>{body}</EmailText>

      <EmailSection>
        <EmailButton href={href}>{cta}</EmailButton>
      </EmailSection>

      <EmailText className="text-sm text-default-700">
        {fallback}

        <EmailLink href={href}>{href}</EmailLink>
      </EmailText>
    </EmailLayout>
  );
}

const t = enMessages.WorkspaceSetupNotice;

WorkspaceSetupNotice.PreviewProps = {
  ...PREVIEW_EMAIL_LAYOUT_PROPS,
  greeting: t.greeting.replace("{firstName}", "Sofia"),
  body: t.planReady.body,
  cta: t.planReady.cta,
  fallback: t.fallback,
  subject: t.planReady.subject,
  title: t.planReady.title,
  href: "https://customermates.com/en/onboarding/wizard",
} satisfies Props;
