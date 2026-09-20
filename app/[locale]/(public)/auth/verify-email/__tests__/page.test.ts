import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAccountState: vi.fn(),
  resolveOnboardingIntent: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("next-intl/server", () => ({ getLocale: vi.fn().mockResolvedValue("en") }));
vi.mock("@/features/auth/next/require", () => ({ requireAccountState: mocks.requireAccountState }));
vi.mock("@/features/company/next/onboarding-intent", () => ({
  resolveOnboardingIntent: mocks.resolveOnboardingIntent,
}));
vi.mock("@/components/shared/centered-card-page", () => ({ CenteredCardPage: "centered-card-page" }));
vi.mock("../verify-email-card", () => ({ VerifyEmailCard: "verify-email-card" }));

import VerifyEmailPage from "../page";

describe("VerifyEmailPage onboarding intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves an invitation when the session expires before the page loads", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue({
      companyId: "company-a",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      intent: "signed.intent",
      inviterName: "Invite Admin",
      source: "explicit",
      status: "valid",
      token: "invite-a",
      type: "invitation",
    });
    mocks.requireAccountState.mockImplementation((_expected, _fallback, redirects) => {
      throw new Error(`REDIRECT:${redirects.unauthenticated}`);
    });

    await expect(VerifyEmailPage({ searchParams: Promise.resolve({ intent: "signed.intent" }) })).rejects.toThrow(
      "REDIRECT:/auth/signin?intent=signed.intent",
    );
    expect(mocks.resolveOnboardingIntent).toHaveBeenCalledWith("signed.intent");
    expect(mocks.requireAccountState).toHaveBeenCalledWith(
      ["overdueVerification", "unregistered"],
      "/",
      expect.objectContaining({ unauthenticated: "/auth/signin?intent=signed.intent" }),
    );
  });

  it("lets an overdue account verify when an onboarding intent is invalid", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue({
      errorMessage: "onboardingSessionExpired",
      source: "explicit",
      status: "invalid",
    });
    mocks.requireAccountState.mockResolvedValue({
      sessionUser: { email: "invited@example.com", id: "auth-user" },
      state: "overdueVerification",
    });

    const result = await VerifyEmailPage({ searchParams: Promise.resolve({ intent: "expired.intent" }) });
    const card = result.props.children;

    expect(card.props).toMatchObject({ email: "invited@example.com" });
    expect(card.props.inviterName).toBeUndefined();
    expect(card.props.onboardingIntent).toBeUndefined();
  });

  it("lets an unverified account still inside onboarding request a verification email", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue({ source: "absent", status: "absent" });
    mocks.requireAccountState.mockResolvedValue({
      emailVerified: false,
      sessionUser: { email: "setting-up@example.com", id: "auth-user" },
      state: "unregistered",
    });

    const result = await VerifyEmailPage({ searchParams: Promise.resolve({}) });

    expect(result.props.children.props).toMatchObject({ email: "setting-up@example.com" });
  });

  it("sends a verified account back to onboarding rather than the verification card", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue({ source: "absent", status: "absent" });
    mocks.requireAccountState.mockResolvedValue({
      emailVerified: true,
      sessionUser: { email: "done@example.com", id: "auth-user" },
      state: "unregistered",
    });

    await expect(VerifyEmailPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/en/onboarding");
  });

  it("tells a signed-out visitor when the link they followed had expired", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue({ source: "absent", status: "absent" });
    mocks.requireAccountState.mockResolvedValue({ sessionUser: null, state: "unauthenticated" });

    const result = await VerifyEmailPage({
      searchParams: Promise.resolve({ error: "TOKEN_EXPIRED", verified: "1" }),
    });

    expect(result.props.children.props).toMatchObject({
      email: undefined,
      justVerified: false,
      linkProblem: "expired",
    });
  });

  it("never claims success for a link the server rejected for any other reason", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue({ source: "absent", status: "absent" });
    mocks.requireAccountState.mockResolvedValue({ sessionUser: null, state: "unauthenticated" });

    const result = await VerifyEmailPage({
      searchParams: Promise.resolve({ error: "USER_NOT_FOUND", verified: "1" }),
    });

    expect(result.props.children.props).toMatchObject({
      email: undefined,
      justVerified: false,
      linkProblem: "invalid",
    });
  });

  it("tells a signed-out visitor to sign in once their link has verified the address", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue({ source: "absent", status: "absent" });
    mocks.requireAccountState.mockResolvedValue({ sessionUser: null, state: "unauthenticated" });

    const result = await VerifyEmailPage({ searchParams: Promise.resolve({ verified: "1" }) });

    expect(result.props.children.props).toMatchObject({ email: undefined, justVerified: true, linkProblem: undefined });
  });

  it("never reports a signed-in account as just verified", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue({ source: "absent", status: "absent" });
    mocks.requireAccountState.mockResolvedValue({
      sessionUser: { email: "overdue@example.com", id: "auth-user" },
      state: "overdueVerification",
    });

    const result = await VerifyEmailPage({ searchParams: Promise.resolve({ verified: "1" }) });

    expect(result.props.children.props).toMatchObject({ email: "overdue@example.com", justVerified: false });
  });

  it("shows a signed-out visitor how to continue when no intent is in play", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue({ source: "absent", status: "absent" });
    mocks.requireAccountState.mockResolvedValue({ sessionUser: null, state: "unauthenticated" });

    const result = await VerifyEmailPage({ searchParams: Promise.resolve({}) });
    const card = result.props.children;

    expect(mocks.requireAccountState).toHaveBeenCalledWith(
      ["overdueVerification", "unregistered", "unauthenticated"],
      "/",
      undefined,
    );
    expect(card.props).toMatchObject({ email: undefined, justVerified: false });
  });
});
