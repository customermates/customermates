import { EmailLayout } from "@/components/emails/base/email-layout";
import { EmailSection } from "@/components/emails/base/email-section";
import { EmailText } from "@/components/emails/base/email-text";

type Props = {
  name: string;
  email: string;
  company?: string;
  message: string;
};

export default function ContactInquiry({ name, email, company, message }: Props) {
  const subject = "New contact inquiry";

  return (
    <EmailLayout preview={subject} title={subject}>
      <EmailSection>
        <EmailText>
          <strong>From:</strong>

          {` ${name} (${email})`}
        </EmailText>

        {company ? (
          <EmailText>
            <strong>Company:</strong>

            {` ${company}`}
          </EmailText>
        ) : null}

        <EmailText>
          <strong>Message:</strong>
        </EmailText>

        <EmailText className="whitespace-pre-wrap">{message}</EmailText>
      </EmailSection>
    </EmailLayout>
  );
}

ContactInquiry.PreviewProps = {
  name: "Jane Doe",
  email: "jane@example.com",
  company: "Acme Inc.",
  message: "Hi, I'd like to learn more about Customermates for my agency.",
};
