export abstract class NotificationPauseRepo {
  abstract find(): Promise<Date | null>;
  abstract save(until: Date): Promise<void>;
  abstract clear(): Promise<void>;

  abstract findUnscoped(companyId: string, userIds: string[]): Promise<Map<string, Date>>;
}
