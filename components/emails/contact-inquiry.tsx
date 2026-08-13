import { EmailField } from "@/components/emails/base/email-field";
import { EmailLayout, type EmailLayoutSharedProps } from "@/components/emails/base/email-layout";
import { PREVIEW_EMAIL_LAYOUT_PROPS } from "@/components/emails/preview-layout-props";

type Props = EmailLayoutSharedProps & {
  name: string;
  email: string;
  company?: string;
  message: string;
};

export default function ContactInquiry({ name, email, company, message, ...layoutProps }: Props) {
  const subject = "New contact inquiry";

  return (
    <EmailLayout {...layoutProps} preview={subject} title={subject}>
      <EmailField label="From">{`${name} (${email})`}</EmailField>

      {company ? <EmailField label="Company">{company}</EmailField> : null}

      <EmailField label="Message">{message}</EmailField>
    </EmailLayout>
  );
}

ContactInquiry.PreviewProps = {
  ...PREVIEW_EMAIL_LAYOUT_PROPS,
  name: "Jane Doe",
  email: "jane@example.com",
  company: "Acme Inc.",
  message: "Hi, I'd like to learn more about Customermates for my agency.",
} satisfies Props;
