import type { IngestMessage, MessagingMessage } from "../messaging.schema";
import type { DraftThreadTarget } from "../draft-thread";

import { DraftSendRepo } from "./draft-send.repo";

export abstract class StartChatThreadRepo extends DraftSendRepo {
  abstract findDraftById(args: { messageId: string }): Promise<DraftThreadTarget | null>;
  abstract persistOutboundMessageOrThrow(args: {
    connectedAccountId: string;
    message: IngestMessage;
  }): Promise<MessagingMessage>;
}
