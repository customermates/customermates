import type { IngestMessage, MessagingMessage } from "../messaging.schema";
import { type DraftThreadTarget } from "../draft-thread";

export abstract class StartChatThreadRepo {
  abstract findDraftById(args: { messageId: string }): Promise<DraftThreadTarget | null>;
  abstract discardDraftAfterSend(args: { messageId: string; expectedUpdatedAt: Date }): Promise<void>;
  abstract persistOutboundMessageOrThrow(args: {
    connectedAccountId: string;
    message: IngestMessage;
  }): Promise<MessagingMessage>;
}
