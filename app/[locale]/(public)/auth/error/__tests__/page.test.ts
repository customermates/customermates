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
vi.mock("@/components/shared/centered-card-page", () => ({ CenteredCardPage: "centered-card-page" }));
vi.mock("../error-page-content", () => ({ ErrorPageContent: "error-page-content" }));
vi.mock("../inactive-card", () => ({ InactiveCard: "inactive-card" }));

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
      expect(result.type).toBe("error-page-content");
      expect(result.props).toEqual({ errorKey });
    },
  );

  it("keeps the inactive-account error canonical", async () => {
    mocks.resolveAccountState.mockResolvedValue({ state: "inactive" });

    await expect(ErrorPage({ searchParams: Promise.resolve({ type: "inviteLinkExpired" }) })).rejects.toThrow(
      "REDIRECT:/en/auth/error?type=inactiveUser",
    );
  });

  it("shows a deactivated membership its own card instead of the error card", async () => {
    mocks.resolveAccountState.mockResolvedValue({ state: "inactive" });

    const result = await ErrorPage({ searchParams: Promise.resolve({ type: "inactiveUser" }) });

    expect(result.type).toBe("centered-card-page");
    expect(result.props.children.type).toBe("inactive-card");
    expect(mocks.requireAccountState).not.toHaveBeenCalled();
  });

  it("falls back to the support message for an unknown error type", async () => {
    mocks.resolveAccountState.mockResolvedValue({ state: "allowed" });

    const result = await ErrorPage({ searchParams: Promise.resolve({ type: "somethingElse" }) });

    expect(result.type).toBe("error-page-content");
    expect(result.props).toEqual({ errorKey: null });
  });
});
