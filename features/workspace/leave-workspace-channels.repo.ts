export abstract class LeaveWorkspaceChannelsRepo {
  abstract findOwnedConnectedAccountIdsCompanyWide(userId: string): Promise<string[]>;
}
