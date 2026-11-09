import enMessages from "@/i18n/locales/en.json";
import { EmailButton } from "@/components/emails/base/email-button";
import { EmailLayout, type EmailLayoutSharedProps } from "@/components/emails/base/email-layout";
import { EmailLink } from "@/components/emails/base/email-link";
import { EmailSection } from "@/components/emails/base/email-section";
import { EmailText } from "@/components/emails/base/email-text";
import { PREVIEW_EMAIL_LAYOUT_PROPS } from "@/components/emails/preview-layout-props";
import { env } from "@/env";

const SIGN_IN_HREF = `${env.BASE_URL}/auth/signin`;

type Props = EmailLayoutSharedProps & {
  greeting: string;
  body: string;
  kept: string;
  cta: string;
  scheduleFallback: string;
  signoff: string;
  subject: string;
  title: string;
  href?: string;
};

export default function PlanPauseNotice({
  greeting,
  body,
  kept,
  cta,
  scheduleFallback,
  signoff,
  subject,
  title,
  href,
  ...layoutProps
}: Props) {
  const resolvedHref = href ?? SIGN_IN_HREF;

  return (
    <EmailLayout {...layoutProps} preview={subject} title={title}>
      <EmailText>{greeting}</EmailText>

      <EmailText>{body}</EmailText>

      <EmailText>{kept}</EmailText>

      <EmailSection>
        <EmailButton href={resolvedHref}>{cta}</EmailButton>
      </EmailSection>

      <EmailText className="text-sm text-default-700">
        {scheduleFallback}

        <EmailLink href={resolvedHref}>{resolvedHref}</EmailLink>
      </EmailText>

      <EmailText className="whitespace-pre-line">{signoff}</EmailText>
    </EmailLayout>
  );
}

const t = enMessages.PlanPauseNotice;
const previewFirstName = "Sofia";

PlanPauseNotice.PreviewProps = {
  ...PREVIEW_EMAIL_LAYOUT_PROPS,
  greeting: t.greeting.replace("{firstName}", previewFirstName),
  body: t.bodyNamed.replace("{workspace}", "Northwind Studio").replace("{owner}", "Alex Morgan"),
  kept: t.kept,
  cta: t.cta,
  scheduleFallback: t.scheduleFallback,
  signoff: t.signoff,
  subject: t.subjectNamed.replace("{workspace}", "Northwind Studio"),
  title: t.title,
  href: SIGN_IN_HREF,
} satisfies Props;
