import { EmailField } from "@/components/emails/base/email-field";
import { EmailLayout, type EmailLayoutSharedProps } from "@/components/emails/base/email-layout";
import { PREVIEW_EMAIL_LAYOUT_PROPS } from "@/components/emails/preview-layout-props";

type Props = EmailLayoutSharedProps & {
  feedback: string;
  userEmail: string;
  userName: string;
  subject: string;
};

export default function Feedback({ feedback, userEmail, userName, subject, ...layoutProps }: Props) {
  return (
    <EmailLayout {...layoutProps} preview={subject} title={subject}>
      <EmailField label="From">{`${userName} (${userEmail})`}</EmailField>

      <EmailField label="Type">{subject}</EmailField>

      <EmailField label="Feedback">{feedback}</EmailField>
    </EmailLayout>
  );
}

Feedback.PreviewProps = {
  ...PREVIEW_EMAIL_LAYOUT_PROPS,
  feedback: "The CRM is working great! I found it very helpful for managing my contacts.",
  userEmail: "user@example.com",
  userName: "John Doe",
  subject: "Product Feedback",
} satisfies Props;
