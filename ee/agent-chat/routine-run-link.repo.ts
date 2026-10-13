export type RoutineRunLinkArgs = {
  companyId: string;
  routineRunId: string;
  executedByUserId: string;
  conversationId: string;
};

export abstract class RoutineRunLinkRepo {
  abstract linkAdmittedTurnCompanyWide(
    args: RoutineRunLinkArgs & { turnRequestId: string; startedAt: Date },
  ): Promise<boolean>;
  abstract linkConversationCompanyWide(args: RoutineRunLinkArgs): Promise<boolean>;
  abstract releaseUnstartedConversationCompanyWide(args: RoutineRunLinkArgs): Promise<boolean>;
}
