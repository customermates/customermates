import { createElement } from "react";

import type { EmailService } from "@/features/email/email.service";
import type { NotificationMailer } from "./notification-mailer";
import type { NotificationRecipient, PendingEmailNotification } from "./notification.repo";

import NotificationEmail from "@/components/emails/notification-email";
import { getEmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import { absoluteWorkspaceUrl } from "@/core/navigation/workspace-paths";
import { env } from "@/env";
import { getTranslator } from "@/i18n/get-translator";
import { resolveUserLocale } from "@/i18n/user-locale";

const DIGEST_ITEM_LIMIT = 20;

export class EmailNotificationMailer implements NotificationMailer {
  constructor(private readonly emailService: Pick<EmailService, "send">) {}

  sendInstant(recipient: NotificationRecipient, notification: PendingEmailNotification): Promise<boolean> {
    return this.send(recipient, [notification], "instant");
  }

  sendDigest(recipient: NotificationRecipient, notifications: PendingEmailNotification[]): Promise<boolean> {
    return this.send(recipient, notifications, "digest");
  }

  private async send(
    recipient: NotificationRecipient,
    notifications: PendingEmailNotification[],
    mode: "instant" | "digest",
  ): Promise<boolean> {
    if (env.NODE_ENV === "production" && !env.RESEND_API_KEY) return false;
    const locale = resolveUserLocale(recipient);
    const t = await getTranslator(locale, "NotificationEmail");
    const layoutCopy = await getEmailLayoutCopy(locale);
    const first = notifications[0];
    const link = first?.href ?? "/dashboard";
    const subject = mode === "instant" && first ? first.title : t("digestSubject");
    return this.emailService.send({
      to: recipient.email,
      subject,
      react: createElement(NotificationEmail, {
        locale,
        layoutCopy,
        greeting: t("greeting", { firstName: recipient.firstName }),
        intro: mode === "instant" ? t("instantIntro") : t("digestIntro"),
        items: notifications
          .slice(0, DIGEST_ITEM_LIMIT)
          .map((item) => ({ title: item.title, ...(item.body ? { body: item.body } : {}) })),
        cta: t("cta"),
        href: absoluteWorkspaceUrl(env.BASE_URL, locale, recipient.workspaceSlug, link),
        preferencesHint: t("preferencesHint"),
        subject,
        title: t("title"),
      }),
      deduplicationKey: `notification:${mode}:${notifications.map((item) => item.id).join(",")}`.slice(0, 256),
    });
  }
}
