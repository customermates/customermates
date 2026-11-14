import type { NotificationRecipient, PendingEmailNotification } from "./notification.repo";

export type NotificationMailer = {
  sendInstant(recipient: NotificationRecipient, notification: PendingEmailNotification): Promise<boolean>;
  sendDigest(recipient: NotificationRecipient, notifications: PendingEmailNotification[]): Promise<boolean>;
};
