import { XEmailLayout } from "@/components/x-emails/base/x-email-layout";
import { XEmailSection } from "@/components/x-emails/base/x-email-section";
import { XEmailText } from "@/components/x-emails/base/x-email-text";

type Props = {
  feedback: string;
  userEmail: string;
  userName: string;
  subject: string;
};

export default function XFeedback({ feedback, userEmail, userName, subject }: Props) {
  return (
    <XEmailLayout preview={subject} title={subject}>
      <XEmailSection>
        <XEmailText>
          <strong>From:</strong>

          {` ${userName} (${userEmail})`}
        </XEmailText>

        <XEmailText>
          <strong>Type:</strong>

          {` ${subject}`}
        </XEmailText>

        <XEmailText>
          <strong>Feedback:</strong>
        </XEmailText>

        <XEmailText className="whitespace-pre-wrap">{feedback}</XEmailText>
      </XEmailSection>
    </XEmailLayout>
  );
}

XFeedback.PreviewProps = {
  feedback: "The AI agent is working great! I found it very helpful for managing my contacts.",
  userEmail: "user@example.com",
  userName: "John Doe",
  subject: "AI Agent Feedback",
};
