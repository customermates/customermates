import enMessages from "@/i18n/locales/en.json";
import { EmailButton } from "@/components/emails/base/email-button";
import { EmailLayout, type EmailLayoutSharedProps } from "@/components/emails/base/email-layout";
import { EmailSection } from "@/components/emails/base/email-section";
import { EmailText } from "@/components/emails/base/email-text";
import { PREVIEW_EMAIL_LAYOUT_PROPS } from "@/components/emails/preview-layout-props";
import { env } from "@/env";

const SIGN_IN_HREF = `${env.BASE_URL}/auth/signin`;

type Props = EmailLayoutSharedProps & {
  greeting: string;
  body: string;
  otherWorkspaces: string;
  cta: string;
  rejoin: string;
  subject: string;
  title: string;
  href?: string;
};

export default function WorkspaceRemovalNotice({
  greeting,
  body,
  otherWorkspaces,
  cta,
  rejoin,
  subject,
  title,
  href,
  ...layoutProps
}: Props) {
  return (
    <EmailLayout {...layoutProps} preview={subject} title={title}>
      <EmailText>{greeting}</EmailText>

      <EmailText>{body}</EmailText>

      <EmailText>{otherWorkspaces}</EmailText>

      <EmailSection>
        <EmailButton href={href ?? SIGN_IN_HREF}>{cta}</EmailButton>
      </EmailSection>

      <EmailText className="text-sm text-default-700">{rejoin}</EmailText>
    </EmailLayout>
  );
}

const t = enMessages.WorkspaceRemovalNotice;
const previewFirstName = "Sofia";
const previewWorkspace = "Hoffmann Consulting";

WorkspaceRemovalNotice.PreviewProps = {
  ...PREVIEW_EMAIL_LAYOUT_PROPS,
  greeting: t.greeting.replace("{firstName}", previewFirstName),
  body: t.body.replace("{workspace}", previewWorkspace),
  otherWorkspaces: t.otherWorkspaces,
  cta: t.cta,
  rejoin: t.rejoin.replace("{workspace}", previewWorkspace),
  subject: t.subject.replace("{workspace}", previewWorkspace),
  title: t.title,
  href: SIGN_IN_HREF,
} satisfies Props;
