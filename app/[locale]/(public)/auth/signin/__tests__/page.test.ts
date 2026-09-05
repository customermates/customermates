import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUnauthenticated: vi.fn(),
  resolveAccountState: vi.fn(),
  resolveOnboardingIntent: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next-intl/server", () => ({ getLocale: () => Promise.resolve("en") }));
vi.mock("@/core/auth/better-auth", () => ({
  enabledSocialProviders: { google: false, microsoft: false },
}));
vi.mock("@/core/fumadocs/metadata", () => ({ generateMetadataFromMeta: vi.fn() }));
vi.mock("@/features/auth/next/require", () => ({
  requireUnauthenticated: mocks.requireUnauthenticated,
}));
vi.mock("@/features/auth/next/resolve-account-state", () => ({
  resolveRequestAccountState: mocks.resolveAccountState,
}));
vi.mock("@/features/company/next/onboarding-intent", () => ({
  resolveOnboardingIntent: mocks.resolveOnboardingIntent,
}));
vi.mock("@/components/shared/centered-card-page", () => ({ CenteredCardPage: "centered-card-page" }));
vi.mock("../sign-in-form", () => ({ SignInForm: "sign-in-form" }));

import SignInPage from "../page";

const invitation = {
  companyId: "company-a",
  expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  intent: "signed.intent",
  inviterName: "Invite Admin",
  source: "explicit",
  status: "valid",
  token: "invite-a",
  type: "invitation",
} as const;

describe("SignInPage onboarding intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUnauthenticated.mockResolvedValue(undefined);
    mocks.resolveAccountState.mockResolvedValue({ sessionUser: null, state: "unauthenticated" });
    mocks.resolveOnboardingIntent.mockResolvedValue({ status: "absent" });
  });

  it("recovers an invitation nested in a proxy callback URL", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue(invitation);

    const result = await SignInPage({
      searchParams: Promise.resolve({ callbackURL: "/onboarding/wizard?intent=signed.intent" }),
    });
    const form = result.props.children;

    expect(mocks.resolveOnboardingIntent).toHaveBeenCalledWith("signed.intent");
    expect(form.props).toMatchObject({
      callbackURL: "/auth/invitation?intent=signed.intent",
      inviterName: "Invite Admin",
      onboardingIntent: "signed.intent",
    });
  });

  it("fails closed on duplicate nested intents instead of consulting legacy state", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue({
      errorMessage: "invalidOnboardingIntent",
      source: "explicit",
      status: "invalid",
    });

    await expect(
      SignInPage({
        searchParams: Promise.resolve({ callbackURL: "/auth/invitation?intent=one&intent=two" }),
      }),
    ).rejects.toThrow("REDIRECT:/en/auth/error?type=invalidOnboardingIntent");
    expect(mocks.resolveOnboardingIntent).toHaveBeenCalledWith([]);
    expect(mocks.requireUnauthenticated).not.toHaveBeenCalled();
  });

  it("fails closed on duplicate callback parameters instead of consulting legacy state", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue({
      errorMessage: "invalidOnboardingIntent",
      source: "explicit",
      status: "invalid",
    });

    await expect(
      SignInPage({ searchParams: Promise.resolve({ callbackURL: ["/auth/signin", "/auth/invitation"] }) }),
    ).rejects.toThrow("REDIRECT:/en/auth/error?type=invalidOnboardingIntent");
    expect(mocks.resolveOnboardingIntent).toHaveBeenCalledWith([]);
  });

  it("routes an already signed-in visitor to the invitation explanation", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue(invitation);
    mocks.resolveAccountState.mockResolvedValue({
      sessionUser: { id: "auth-user-one" },
      state: "registered",
    });

    await expect(SignInPage({ searchParams: Promise.resolve({ intent: "signed.intent" }) })).rejects.toThrow(
      "REDIRECT:/en/auth/invitation?intent=signed.intent",
    );
    expect(mocks.requireUnauthenticated).not.toHaveBeenCalled();
  });

  it("resumes a signed create decision after authentication", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue({
      authUserId: "auth-user-one",
      intent: "signed.create",
      source: "explicit",
      status: "valid",
      type: "createCompany",
    });

    const result = await SignInPage({ searchParams: Promise.resolve({ intent: "signed.create" }) });
    const form = result.props.children;

    expect(form.props).toMatchObject({
      callbackURL: "/onboarding/wizard?intent=signed.create",
      onboardingIntent: "signed.create",
    });
    expect(form.props.inviterName).toBeUndefined();
  });

  it("rejects a create decision when a different identity is already signed in", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue({
      authUserId: "auth-user-one",
      intent: "signed.create",
      source: "explicit",
      status: "valid",
      type: "createCompany",
    });
    mocks.resolveAccountState.mockResolvedValue({
      sessionUser: { id: "auth-user-two" },
      state: "unregistered",
    });

    await expect(SignInPage({ searchParams: Promise.resolve({ intent: "signed.create" }) })).rejects.toThrow(
      "REDIRECT:/en/auth/error?type=invalidOnboardingIntent",
    );
  });
});
