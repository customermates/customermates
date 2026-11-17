import type { NotificationPauseState } from "./notification-pause";

export abstract class NotificationPauseRepo {
  abstract find(): Promise<NotificationPauseState | null>;
  abstract save(pause: NotificationPauseState): Promise<void>;
  abstract clear(): Promise<void>;

  abstract findUnscoped(companyId: string, userIds: string[]): Promise<Map<string, Date>>;
}
