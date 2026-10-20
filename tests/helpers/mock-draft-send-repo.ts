import type { Mock } from "vitest";
import type { DraftSendRepo } from "@/ee/messaging/outbound/draft-send.repo";

import { vi } from "vitest";

export const MOCK_DRAFT_SEND_CLAIM_ID = "00000000-0000-4000-8000-0000000000c1";

type MockDraftSendRepo = { [Method in keyof DraftSendRepo]: Mock<DraftSendRepo[Method]> };

export function mockDraftSendRepo(): MockDraftSendRepo {
  return {
    findDraftSend: vi.fn<DraftSendRepo["findDraftSend"]>().mockResolvedValue(null),
    reconcileDraftSend: vi.fn<DraftSendRepo["reconcileDraftSend"]>(function (
      this: Pick<DraftSendRepo, "findDraftSend">,
      args,
    ) {
      return this.findDraftSend(args);
    }),
    beginDraftSend: vi.fn<DraftSendRepo["beginDraftSend"]>((args) =>
      Promise.resolve({
        status: "claimed",
        claim: { id: MOCK_DRAFT_SEND_CLAIM_ID, draftRevision: args.draftRevision },
      }),
    ),
    settleDraftSend: vi.fn<DraftSendRepo["settleDraftSend"]>().mockResolvedValue(undefined),
    recordDraftSendResult: vi.fn<DraftSendRepo["recordDraftSendResult"]>().mockResolvedValue(undefined),
    releaseDraftSend: vi.fn<DraftSendRepo["releaseDraftSend"]>().mockResolvedValue(undefined),
    completeDraftSendRemovingDraft: vi
      .fn<DraftSendRepo["completeDraftSendRemovingDraft"]>()
      .mockResolvedValue(undefined),
    completeReplyDraftSend: vi.fn<DraftSendRepo["completeReplyDraftSend"]>().mockResolvedValue(null),
    findDraftSendMessage: vi.fn<DraftSendRepo["findDraftSendMessage"]>().mockResolvedValue(null),
  } satisfies DraftSendRepo;
}
