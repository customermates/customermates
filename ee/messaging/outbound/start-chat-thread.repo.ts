import type { IngestMessage, MessagingMessage } from "../messaging.schema";
import type { DraftThreadTarget } from "../draft-thread";

export abstract class StartChatThreadRepo {
  abstract findDraftById(args: { messageId: string }): Promise<DraftThreadTarget | null>;
  abstract persistOutboundMessageOrThrow(args: {
    connectedAccountId: string;
    message: IngestMessage;
  }): Promise<MessagingMessage>;
}
