export abstract class UpdateUserRoleRepo {
  abstract isSystemRoleOrThrow(id: string): Promise<boolean>;
  abstract hasAnotherActiveSystemRoleUser(excludeUserId: string): Promise<boolean>;
}
