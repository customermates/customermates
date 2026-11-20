import type { NewWorkspaceSignup } from "@/features/acquisition/new-workspace-signup";

import { EmailField } from "@/components/emails/base/email-field";
import { EmailLayout, type EmailLayoutSharedProps } from "@/components/emails/base/email-layout";
import { PREVIEW_EMAIL_LAYOUT_PROPS } from "@/components/emails/preview-layout-props";
import { operatorSignupFields } from "@/features/acquisition/new-workspace-signup";

type Props = EmailLayoutSharedProps & {
  email: string;
  name: string;
  provider?: string;
  signup?: NewWorkspaceSignup;
  company?: boolean;
};

export default function NewUserNotification({ email, name, provider, signup, company, ...layoutProps }: Props) {
  const subject = company ? "New company signup" : "New user registration";
  const signupFields = signup ? operatorSignupFields(signup) : [];

  return (
    <EmailLayout {...layoutProps} preview={subject} title={subject}>
      <EmailField label="User">{`${name} (${email})`}</EmailField>

      {provider ? <EmailField label="Provider">{provider}</EmailField> : null}

      {signupFields.map((field) => (
        <EmailField key={field.label} label={field.label}>
          {field.value}
        </EmailField>
      ))}
    </EmailLayout>
  );
}

NewUserNotification.PreviewProps = {
  ...PREVIEW_EMAIL_LAYOUT_PROPS,
  email: "user@example.com",
  name: "John Doe",
  provider: "Google",
  company: true,
  signup: {
    businessEmail: true,
    teamSize: "small",
    campaign: { source: "google", medium: "cpc", campaign: "de-company-k1", content: null, term: "crm outlook" },
    template: null,
    lastPage: "/de/features/simple-crm",
  },
} satisfies Props;
