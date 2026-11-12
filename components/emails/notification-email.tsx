import enMessages from "@/i18n/locales/en.json";
import { EmailButton } from "@/components/emails/base/email-button";
import { EmailLayout, type EmailLayoutSharedProps } from "@/components/emails/base/email-layout";
import { EmailSection } from "@/components/emails/base/email-section";
import { EmailText } from "@/components/emails/base/email-text";
import { PREVIEW_EMAIL_LAYOUT_PROPS } from "@/components/emails/preview-layout-props";

type NotificationEmailItem = { title: string; body?: string };

type Props = EmailLayoutSharedProps & {
  greeting: string;
  intro: string;
  items: NotificationEmailItem[];
  cta: string;
  href: string;
  preferencesHint: string;
  subject: string;
  title: string;
};

export default function NotificationEmail({
  greeting,
  intro,
  items,
  cta,
  href,
  preferencesHint,
  subject,
  title,
  ...layoutProps
}: Props) {
  return (
    <EmailLayout {...layoutProps} preview={subject} title={title}>
      <EmailText>{greeting}</EmailText>

      <EmailText>{intro}</EmailText>

      {items.map((item, index) => (
        <EmailSection key={`${index}-${item.title}`}>
          <EmailText className="font-semibold">{item.title}</EmailText>

          {item.body ? <EmailText className="text-sm text-default-700">{item.body}</EmailText> : null}
        </EmailSection>
      ))}

      <EmailSection>
        <EmailButton href={href}>{cta}</EmailButton>
      </EmailSection>

      <EmailText className="text-sm text-default-700">{preferencesHint}</EmailText>
    </EmailLayout>
  );
}

const t = enMessages.NotificationEmail;

NotificationEmail.PreviewProps = {
  ...PREVIEW_EMAIL_LAYOUT_PROPS,
  greeting: t.greeting.replace("{firstName}", "Sofia"),
  intro: t.digestIntro,
  items: [{ title: t.title, body: t.digestIntro }],
  cta: t.cta,
  href: "https://app.example.test/records",
  preferencesHint: t.preferencesHint,
  subject: t.digestSubject,
  title: t.title,
} satisfies Props;
