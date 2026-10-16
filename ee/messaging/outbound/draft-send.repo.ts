import type { MessagingMessage } from "../messaging.schema";
import type { DraftSendClaim, DraftSendRecord, DraftSendStart } from "../draft-send";

export abstract class DraftSendRepo {
  abstract findDraftSend(args: { draftMessageId: string }): Promise<DraftSendRecord | null>;
  abstract beginDraftSend(args: {
    draftMessageId: string;
    draftRevision: Date;
    connectedAccountId: string;
    contentHash: string;
  }): Promise<DraftSendStart>;
  abstract settleDraftSend(args: {
    claim: DraftSendClaim;
    state: "sent" | "unknown";
    unipileMessageId?: string | null;
    providerMessageId?: string | null;
  }): Promise<void>;
  abstract recordDraftSendResult(args: {
    claim: DraftSendClaim;
    sentMessageId: string;
    sentThreadId: string;
  }): Promise<void>;
  abstract releaseDraftSend(args: { claim: DraftSendClaim }): Promise<void>;
  abstract completeDraftSendRemovingDraft(args: {
    claim: DraftSendClaim;
    draftMessageId: string;
    unipileMessageId: string | null;
    providerMessageId: string | null;
  }): Promise<void>;
  abstract findDraftSendMessage(args: {
    record: DraftSendRecord;
    connectedAccountId: string;
  }): Promise<MessagingMessage | null>;
}
