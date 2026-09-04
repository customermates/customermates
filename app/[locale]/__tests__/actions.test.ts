import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearInviteTokenCookie: vi.fn(),
  serializeResult: vi.fn(async (result: unknown) => await result),
  signOut: vi.fn(),
  unused: vi.fn(),
}));

vi.mock("@/core/di", () => ({
  getCaptureAdClickInteractor: () => ({ invoke: mocks.unused }),
  getDecideAdAttributionConsentInteractor: () => ({ invoke: mocks.unused }),
  getReadAdAttributionConsentInteractor: () => ({ invoke: mocks.unused }),
  getSignOutInteractor: () => ({ invoke: mocks.signOut }),
  getWithdrawAdAttributionInteractor: () => ({ invoke: mocks.unused }),
}));
vi.mock("@/core/utils/action-result", () => ({ serializeResult: mocks.serializeResult }));
vi.mock("@/core/validation/validation.utils", () => ({ unwrapValidated: mocks.unused }));
vi.mock("@/features/company/next/invite-token-cookie", () => ({
  clearInviteTokenCookie: mocks.clearInviteTokenCookie,
}));

import { signOutAction } from "../actions";

describe("shared account actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clearInviteTokenCookie.mockResolvedValue(undefined);
    mocks.signOut.mockResolvedValue({ ok: true, data: null });
  });

  it("clears a legacy invitation before signing out", async () => {
    await signOutAction();

    expect(mocks.clearInviteTokenCookie).toHaveBeenCalledOnce();
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.clearInviteTokenCookie.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.signOut.mock.invocationCallOrder[0],
    );
  });
});
