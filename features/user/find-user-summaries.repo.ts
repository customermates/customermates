export type UserSummary = { id: string; firstName: string; lastName: string; avatarUrl: string | null };

export abstract class FindUserSummariesRepo {
  abstract findUserSummaries(userIds: string[]): Promise<Map<string, UserSummary>>;
}
