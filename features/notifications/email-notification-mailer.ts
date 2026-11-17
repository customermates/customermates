import { createElement } from "react";

import type { NotificationKind } from "@/generated/prisma";
import type { EmailService } from "@/features/email/email.service";
import type { NotificationMailer } from "./notification-mailer";
import type { NotificationRecipient, PendingEmailNotification } from "./notification.repo";

import NotificationEmail from "@/components/emails/notification-email";
import { getEmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import { absoluteWorkspaceUrl } from "@/core/navigation/workspace-paths";
import { env } from "@/env";
import { getTranslator } from "@/i18n/get-translator";
import { formattingTagFor } from "@/i18n/locale-registry";
import { resolveUserLocale } from "@/i18n/user-locale";

import { notificationUnsubscribeSecret, signNotificationUnsubscribe } from "./notification-unsubscribe-token";

const DIGEST_ITEM_LIMIT = 20;
const UNSUBSCRIBE_PATH = "/api/notifications/unsubscribe";
const MANAGE_PATH = "/settings/profile";

function distinct<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export class EmailNotificationMailer implements NotificationMailer {
  constructor(
    private readonly emailService: Pick<EmailService, "send">,
    private readonly authSecret: string | undefined,
    private readonly clock: () => Date = () => new Date(),
  ) {}

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
    const locale = resolveUserLocale(recipient);
    const t = await getTranslator(locale, "NotificationEmail");
    const kindLabels = await getTranslator(locale, "Notifications");
    const layoutCopy = await getEmailLayoutCopy(locale);
    const first = notifications[0];
    const link = first?.href ?? "/dashboard";
    const subject = mode === "instant" && first ? first.title : t("digestSubject");
    const kindLabel = (kind: NotificationKind) => kindLabels(`kinds.${kind}`);
    const sources = distinct(notifications.map((item) => item.sourceRuleName ?? kindLabel(item.kind)));
    const kinds = distinct(notifications.map((item) => item.kind));
    const secret = notificationUnsubscribeSecret(this.authSecret);
    const turnOffLinks =
      secret && first
        ? kinds.map((kind) => ({
            label: kinds.length === 1 ? t("turnOffKind") : t("turnOffNamedKind", { kind: kindLabel(kind) }),
            href: `${env.BASE_URL.replace(/\/+$/u, "")}${UNSUBSCRIBE_PATH}?token=${encodeURIComponent(
              signNotificationUnsubscribe(
                secret,
                { userId: recipient.id, companyId: first.companyId, kind },
                this.clock(),
              ),
            )}`,
          }))
        : [];
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
        footerReason: t("footerReason", {
          count: sources.length,
          sources: new Intl.ListFormat(formattingTagFor(locale), { style: "long", type: "conjunction" }).format(
            sources,
          ),
        }),
        turnOffLinks,
        manage: {
          label: t("manageNotifications"),
          href: absoluteWorkspaceUrl(env.BASE_URL, locale, recipient.workspaceSlug, MANAGE_PATH),
        },
        subject,
        title: t("title"),
      }),
      deduplicationKey: `notification:${mode}:${notifications.map((item) => item.id).join(",")}`.slice(0, 256),
    });
  }
}
