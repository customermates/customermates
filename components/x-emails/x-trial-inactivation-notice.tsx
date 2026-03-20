import enMessages from "@/i18n/locales/en.json";
import { XEmailLayout } from "@/components/x-emails/base/x-email-layout";
import { XEmailText } from "@/components/x-emails/base/x-email-text";

type Props = {
  greeting: string;
  body: string;
  dismiss: string;
  signoff: string;
  subject: string;
  title: string;
};

export default function XTrialInactivationNotice({ greeting, body, dismiss, signoff, subject, title }: Props) {
  return (
    <XEmailLayout preview={subject} title={title}>
      <XEmailText>{greeting}</XEmailText>

      <XEmailText>{body}</XEmailText>

      <XEmailText>{dismiss}</XEmailText>

      <XEmailText>{signoff}</XEmailText>
    </XEmailLayout>
  );
}

const noticeTranslations = enMessages.TrialInactivationNotice;
const previewFirstName = "Sofia";

XTrialInactivationNotice.PreviewProps = {
  greeting: noticeTranslations.greeting.replace("{firstName}", previewFirstName),
  body: noticeTranslations.body,
  dismiss: noticeTranslations.dismiss,
  signoff: noticeTranslations.signoff,
  subject: noticeTranslations.subject,
  title: noticeTranslations.title,
};
