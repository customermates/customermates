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

export default function XTrialInactivationReminder({ greeting, body, dismiss, signoff, subject, title }: Props) {
  return (
    <XEmailLayout preview={subject} title={title}>
      <XEmailText>{greeting}</XEmailText>

      <XEmailText>{body}</XEmailText>

      <XEmailText>{dismiss}</XEmailText>

      <XEmailText>{signoff}</XEmailText>
    </XEmailLayout>
  );
}

const reminderTranslations = enMessages.TrialInactivationReminder;
const previewFirstName = "Sofia";

XTrialInactivationReminder.PreviewProps = {
  greeting: reminderTranslations.greeting.replace("{firstName}", previewFirstName),
  body: reminderTranslations.body,
  dismiss: reminderTranslations.dismiss,
  signoff: reminderTranslations.signoff,
  subject: reminderTranslations.subject,
  title: reminderTranslations.title,
};
