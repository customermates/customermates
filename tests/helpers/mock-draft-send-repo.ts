import { vi } from "vitest";

export const MOCK_DRAFT_SEND_CLAIM_ID = "00000000-0000-4000-8000-0000000000c1";

export function mockDraftSendRepo() {
  return {
    findDraftSend: vi.fn().mockResolvedValue(null),
    beginDraftSend: vi.fn((args: { draftRevision: Date }) =>
      Promise.resolve({ status: "claimed", claim: { id: MOCK_DRAFT_SEND_CLAIM_ID, draftRevision: args.draftRevision } }),
    ),
    settleDraftSend: vi.fn().mockResolvedValue(undefined),
    recordDraftSendResult: vi.fn().mockResolvedValue(undefined),
    releaseDraftSend: vi.fn().mockResolvedValue(undefined),
    completeDraftSendRemovingDraft: vi.fn().mockResolvedValue(undefined),
    findDraftSendMessage: vi.fn().mockResolvedValue(null),
  };
}
