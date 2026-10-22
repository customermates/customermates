export type RecordFileTextExcerpt = { id: string; text: string; totalChars: number };

export abstract class RecordChatFileRepo {
  abstract bindChatFiles(conversationId: string, fileIds: string[]): Promise<number>;
  abstract expireConversationChatFiles(conversationId: string): Promise<number>;
  abstract fileTextExcerpts(fileIds: string[], maxChars: number): Promise<RecordFileTextExcerpt[]>;
}
