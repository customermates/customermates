export abstract class StartRoutineConversationRepo {
  abstract createAndLinkRoutineConversationForRun(args: {
    routineRunId: string;
    conversationId: string;
    title: string | null;
    now: Date;
    creditCeilingMicrocents?: number | null;
  }): Promise<void>;
  abstract releaseUnstartedRoutineConversationForRetry(args: {
    routineRunId: string;
    conversationId: string;
  }): Promise<void>;
  abstract deleteUnusedAgentConversation(conversationId: string): Promise<void>;
}
