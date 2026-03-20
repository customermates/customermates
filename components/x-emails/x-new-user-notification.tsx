import { XEmailLayout } from "@/components/x-emails/base/x-email-layout";
import { XEmailText } from "@/components/x-emails/base/x-email-text";

type Props = {
  email: string;
  name: string;
  provider?: string;
};

export default function XNewUserNotification({ email, name, provider }: Props) {
  return (
    <XEmailLayout preview="New User Registration" title="New User Registration">
      <XEmailText>A new user has registered{provider ? ` via ${provider}` : ""}:</XEmailText>

      <XEmailText>{`${name} (${email})`}</XEmailText>
    </XEmailLayout>
  );
}

XNewUserNotification.PreviewProps = {
  email: "user@example.com",
  name: "John Doe",
  provider: "Google",
};
