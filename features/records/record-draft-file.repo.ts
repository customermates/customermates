export abstract class RecordDraftFileRepo {
  abstract bindDraftFiles(args: {
    draftMessageId: string;
    threadId: string;
    keepFileIds: string[];
    bindFileIds: string[];
  }): Promise<void>;
}
