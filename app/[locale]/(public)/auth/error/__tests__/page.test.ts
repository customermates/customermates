import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAccountState: vi.fn(),
  resolveAccountState: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next-intl/server", () => ({ getLocale: () => Promise.resolve("en") }));
vi.mock("@/features/auth/next/require", () => ({
  requireAccountState: mocks.requireAccountState,
}));
vi.mock("@/features/auth/next/resolve-account-state", () => ({
  resolveRequestAccountState: mocks.resolveAccountState,
}));
vi.mock("../error-page-content", () => ({ ErrorPageContent: "error-page-content" }));

import ErrorPage from "../page";

describe("ErrorPage restricted account handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAccountState.mockResolvedValue({ state: "pending" });
  });

  it.each(["invalidInviteLink", "invalidOnboardingIntent", "inviteLinkExpired", "onboardingSessionExpired"])(
    "lets a restricted user see the %s onboarding error",
    async (errorKey) => {
      const result = await ErrorPage({ searchParams: Promise.resolve({ type: errorKey }) });

      expect(mocks.requireAccountState).not.toHaveBeenCalled();
      expect(result.props).toMatchObject({ errorKey, isInactive: false });
    },
  );

  it("keeps the inactive-account error canonical", async () => {
    mocks.resolveAccountState.mockResolvedValue({ state: "inactive" });

    await expect(ErrorPage({ searchParams: Promise.resolve({ type: "inviteLinkExpired" }) })).rejects.toThrow(
      "REDIRECT:/en/auth/error?type=inactiveUser",
    );
  });
});
