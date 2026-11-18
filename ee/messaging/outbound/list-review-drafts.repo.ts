import type { MessagingMessage, MessagingThread } from "../messaging.schema";

export type ReviewDraftEntry = {
  draft: MessagingMessage;
  thread: MessagingThread;
  history: MessagingMessage[];
};

export abstract class ListReviewDraftsRepo {
  abstract listReviewDrafts(args: { limit: number; historySize: number }): Promise<{
    entries: ReviewDraftEntry[];
    total: number;
  }>;
}
