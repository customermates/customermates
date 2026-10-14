import type { DraftDeleteResult } from "../draft-thread";

export abstract class DiscardDraftRepo {
  abstract deleteDraft(args: { messageId: string; expectedUpdatedAt: Date }): Promise<DraftDeleteResult>;
}
