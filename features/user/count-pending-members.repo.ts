export abstract class CountPendingMembersRepo {
  abstract countPendingMembers(): Promise<number>;
}
