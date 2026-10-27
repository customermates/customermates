import enMessages from "@/i18n/locales/en.json";
import { EmailButton } from "@/components/emails/base/email-button";
import { EmailLayout, type EmailLayoutSharedProps } from "@/components/emails/base/email-layout";
import { EmailSection } from "@/components/emails/base/email-section";
import { EmailText } from "@/components/emails/base/email-text";
import { PREVIEW_EMAIL_LAYOUT_PROPS } from "@/components/emails/preview-layout-props";
import { env } from "@/env";
import { settingsHref } from "@/app/components/navigation/settings-routes";
import { absoluteWorkspaceUrl } from "@/core/navigation/workspace-paths";

const PREVIEW_CONNECTED_ACCOUNTS_HREF = absoluteWorkspaceUrl(env.BASE_URL, null, "acme", settingsHref("channels"));

type Props = EmailLayoutSharedProps & {
  greeting: string;
  body: string;
  cta: string;
  signoff: string;
  subject: string;
  title: string;
  href: string;
};

export default function AccountsRemovedNotice({
  greeting,
  body,
  cta,
  signoff,
  subject,
  title,
  href,
  ...layoutProps
}: Props) {
  return (
    <EmailLayout {...layoutProps} preview={subject} title={title}>
      <EmailText>{greeting}</EmailText>

      <EmailText>{body}</EmailText>

      <EmailSection>
        <EmailButton href={href}>{cta}</EmailButton>
      </EmailSection>

      <EmailText className="whitespace-pre-line">{signoff}</EmailText>
    </EmailLayout>
  );
}

const t = enMessages.AccountsRemovedNotice;
const previewFirstName = "Sofia";
const previewAccounts = "LinkedIn (Jane Doe), Gmail (jane@company.com)";
const previewPlan = "Pro";

AccountsRemovedNotice.PreviewProps = {
  ...PREVIEW_EMAIL_LAYOUT_PROPS,
  greeting: t.greeting.replace("{firstName}", previewFirstName),
  body: t.body.replace("{accounts}", previewAccounts).replace("{plan}", previewPlan),
  cta: t.cta,
  signoff: t.signoff,
  subject: t.subject,
  title: t.title,
  href: PREVIEW_CONNECTED_ACCOUNTS_HREF,
} satisfies Props;
