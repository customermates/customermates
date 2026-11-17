import type { NotificationPauseState } from "../notification-pause";

import { NotificationPauseRepo } from "../notification-pause.repo";

export class FakeNotificationPauseRepo extends NotificationPauseRepo {
  pauses = new Map<string, Date>();
  timeZones = new Map<string, string>();
  currentUserId = "";

  find() {
    const until = this.pauses.get(this.currentUserId);
    return Promise.resolve(until ? { until, timeZone: this.timeZones.get(this.currentUserId) ?? "UTC" } : null);
  }

  save(pause: NotificationPauseState) {
    this.pauses.set(this.currentUserId, pause.until);
    this.timeZones.set(this.currentUserId, pause.timeZone);
    return Promise.resolve();
  }

  clear() {
    this.pauses.delete(this.currentUserId);
    this.timeZones.delete(this.currentUserId);
    return Promise.resolve();
  }

  findUnscoped(_companyId: string, userIds: string[]) {
    return Promise.resolve(new Map([...this.pauses].filter(([userId]) => userIds.includes(userId))));
  }
}
