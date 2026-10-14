export abstract class RoutineConversationPurgeRepo {
  abstract deleteUnlinkedRoutineConversationsCompanyWide(companyId: string, conversationIds: string[]): Promise<void>;
}
