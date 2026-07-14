export abstract class CountActiveUsersRepo {
  abstract countActiveUsers(): Promise<number>;
}
