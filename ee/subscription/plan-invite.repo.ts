export abstract class PlanInviteRepo {
  abstract deleteInviteTokensUnscoped(companyId: string): Promise<number>;
}
