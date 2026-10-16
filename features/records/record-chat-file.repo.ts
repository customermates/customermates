export type RecordFileTextExcerpt = { id: string; text: string; totalChars: number };

export interface RecordChatFileRepo {
  bindChatFiles(conversationId: string, fileIds: string[]): Promise<number>;
  expireConversationChatFiles(conversationId: string): Promise<number>;
  fileTextExcerpts(fileIds: string[], maxChars: number): Promise<RecordFileTextExcerpt[]>;
}
