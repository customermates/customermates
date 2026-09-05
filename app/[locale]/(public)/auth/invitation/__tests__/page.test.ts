import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  resolveAccountState: vi.fn(),
  resolveOnboardingIntent: vi.fn(),
}));

vi.mock("next-intl/server", () => ({ getLocale: () => Promise.resolve("en") }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/components/shared/centered-card-page", () => ({ CenteredCardPage: () => null }));
vi.mock("@/features/auth/next/resolve-account-state", () => ({
  resolveRequestAccountState: mocks.resolveAccountState,
}));
vi.mock("@/features/company/next/onboarding-intent", () => ({
  resolveOnboardingIntent: mocks.resolveOnboardingIntent,
}));
vi.mock("../invitation-card", () => ({ InvitationCard: () => null }));

import InvitationPage from "../page";

describe("InvitationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveOnboardingIntent.mockResolvedValue({
      companyId: "invited-company",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      intent: "signed-intent",
      inviterName: "Invite Admin",
      source: "explicit",
      status: "valid",
      token: "invite-token",
      type: "invitation",
    });
  });

  it("sends an overdue unverified identity without a tenant user through verification", async () => {
    mocks.resolveAccountState.mockResolvedValue({
      state: "overdueVerification",
      sessionUser: { email: "invited@example.com" },
      user: null,
    });

    await InvitationPage({ searchParams: Promise.resolve({ intent: "signed-intent" }) });

    expect(mocks.redirect).toHaveBeenCalledWith("/en/auth/verify-email?intent=signed-intent");
  });

  it("keeps the invitation decision for an overdue identity that already has a tenant user", async () => {
    mocks.resolveAccountState.mockResolvedValue({
      state: "overdueVerification",
      sessionUser: { email: "member@example.com" },
      user: { id: "tenant-user" },
    });

    await InvitationPage({ searchParams: Promise.resolve({ intent: "signed-intent" }) });

    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
