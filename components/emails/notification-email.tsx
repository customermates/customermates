import enMessages from "@/i18n/locales/en.json";
import { EmailButton } from "@/components/emails/base/email-button";
import { EmailLayout, type EmailLayoutSharedProps } from "@/components/emails/base/email-layout";
import { EmailLink } from "@/components/emails/base/email-link";
import { EmailSection } from "@/components/emails/base/email-section";
import { EmailText } from "@/components/emails/base/email-text";
import { PREVIEW_EMAIL_LAYOUT_PROPS } from "@/components/emails/preview-layout-props";

type NotificationEmailItem = { title: string; body?: string };

type NotificationEmailLink = { label: string; href: string };

type Props = EmailLayoutSharedProps & {
  greeting: string;
  intro: string;
  items: NotificationEmailItem[];
  more?: NotificationEmailLink;
  cta: string;
  href: string;
  footerReason: string;
  turnOffLinks: NotificationEmailLink[];
  manage: NotificationEmailLink;
  subject: string;
  title: string;
};

export default function NotificationEmail({
  greeting,
  intro,
  items,
  more,
  cta,
  href,
  footerReason,
  turnOffLinks,
  manage,
  subject,
  title,
  ...layoutProps
}: Props) {
  const footerLinks = [...turnOffLinks, manage];

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

      {more ? (
        <EmailText className="text-sm">
          <EmailLink href={more.href}>{more.label}</EmailLink>
        </EmailText>
      ) : null}

      <EmailSection>
        <EmailButton href={href}>{cta}</EmailButton>
      </EmailSection>

      <EmailText className="text-sm text-default-700">{footerReason}</EmailText>

      <EmailText className="text-sm text-default-700">
        {footerLinks.map((link, index) => (
          <span key={link.href}>
            {index > 0 ? " · " : null}

            <EmailLink href={link.href}>{link.label}</EmailLink>
          </span>
        ))}
      </EmailText>
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
  footerReason: "You get this because Due today notified you",
  turnOffLinks: [
    { label: t.turnOffKind, href: "https://app.example.test/api/notifications/unsubscribe?token=preview" },
  ],
  manage: { label: t.manageNotifications, href: "https://app.example.test/settings/profile" },
  subject: t.digestSubject,
  title: t.title,
} satisfies Props;
