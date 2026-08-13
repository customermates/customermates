import { EmailField } from "@/components/emails/base/email-field";
import { EmailLayout, type EmailLayoutSharedProps } from "@/components/emails/base/email-layout";
import { PREVIEW_EMAIL_LAYOUT_PROPS } from "@/components/emails/preview-layout-props";

type Props = EmailLayoutSharedProps & {
  email: string;
  name: string;
  provider?: string;
};

export default function NewUserNotification({ email, name, provider, ...layoutProps }: Props) {
  const subject = "New user registration";

  return (
    <EmailLayout {...layoutProps} preview={subject} title={subject}>
      <EmailField label="User">{`${name} (${email})`}</EmailField>

      {provider ? <EmailField label="Provider">{provider}</EmailField> : null}
    </EmailLayout>
  );
}

NewUserNotification.PreviewProps = {
  ...PREVIEW_EMAIL_LAYOUT_PROPS,
  email: "user@example.com",
  name: "John Doe",
  provider: "Google",
} satisfies Props;
