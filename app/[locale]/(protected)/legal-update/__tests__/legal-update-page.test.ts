import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  requireAccountState: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/features/auth/next/require", () => ({ requireAccountState: mocks.requireAccountState }));
vi.mock("@/components/shared/centered-card-page", () => ({ CenteredCardPage: () => null }));
vi.mock("../components/legal-update-view", () => ({ LegalUpdateView: () => null }));

import LegalUpdatePage from "../page";

describe("LegalUpdatePage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders a valid pre-deadline notice while the account is still allowed", async () => {
    mocks.requireAccountState.mockResolvedValue({
      state: "allowed",
      legalStatus: {
        contractAccepted: false,
        contractNoticeSent: true,
        effectiveAt: "2026-08-22T00:00:00.000Z",
        isSystemAdministrator: true,
        mustAccept: false,
      },
    });

    await expect(LegalUpdatePage()).resolves.toBeTruthy();

    expect(mocks.requireAccountState).toHaveBeenCalledWith(["allowed", "legal"]);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
