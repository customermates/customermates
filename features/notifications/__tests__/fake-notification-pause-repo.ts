import { NotificationPauseRepo } from "../notification-pause.repo";

export class FakeNotificationPauseRepo extends NotificationPauseRepo {
  pauses = new Map<string, Date>();
  currentUserId = "";

  find() {
    return Promise.resolve(this.pauses.get(this.currentUserId) ?? null);
  }

  save(until: Date) {
    this.pauses.set(this.currentUserId, until);
    return Promise.resolve();
  }

  clear() {
    this.pauses.delete(this.currentUserId);
    return Promise.resolve();
  }

  findUnscoped(_companyId: string, userIds: string[]) {
    return Promise.resolve(new Map([...this.pauses].filter(([userId]) => userIds.includes(userId))));
  }
}
