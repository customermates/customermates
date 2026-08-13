import enMessages from "@/i18n/locales/en.json";
import { EmailLayout, type EmailLayoutSharedProps } from "@/components/emails/base/email-layout";
import { EmailText } from "@/components/emails/base/email-text";
import { PREVIEW_EMAIL_LAYOUT_PROPS } from "@/components/emails/preview-layout-props";

type Props = EmailLayoutSharedProps & {
  greeting: string;
  body: string;
  planNote: string;
  dismiss: string;
  signoff: string;
  subject: string;
  title: string;
};

export default function TrialWelcome({
  greeting,
  body,
  planNote,
  dismiss,
  signoff,
  subject,
  title,
  ...layoutProps
}: Props) {
  return (
    <EmailLayout {...layoutProps} preview={subject} title={title}>
      <EmailText>{greeting}</EmailText>

      <EmailText>{body}</EmailText>

      <EmailText>{planNote}</EmailText>

      <EmailText>{dismiss}</EmailText>

      <EmailText className="whitespace-pre-line">{signoff}</EmailText>
    </EmailLayout>
  );
}

const t = enMessages.TrialWelcome;
const previewFirstName = "Sofia";

TrialWelcome.PreviewProps = {
  ...PREVIEW_EMAIL_LAYOUT_PROPS,
  greeting: t.greeting.replace("{firstName}", previewFirstName),
  body: t.body,
  planNote: t.planNote,
  dismiss: t.dismiss,
  signoff: t.signoff,
  subject: t.subject,
  title: t.title,
} satisfies Props;
