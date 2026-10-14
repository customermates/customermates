export abstract class GetUnreadThreadCountRepo {
  abstract countUnreadThreadsForCurrentUser(): Promise<number>;
}
