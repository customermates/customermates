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
vi.mock("../sign-up-form", () => ({ SignUpForm: "sign-up-form" }));

import SignUpPage from "../page";

const invitation = {
  companyId: "company-a",
  companyName: "Hoffmann Consulting",
  expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  intent: "signed.intent",
  inviterName: "Invite Admin",
  source: "explicit",
  status: "valid",
  token: "invite-a",
  type: "invitation",
} as const;

describe("SignUpPage invitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUnauthenticated.mockResolvedValue(undefined);
    mocks.resolveAccountState.mockResolvedValue({ sessionUser: null, state: "unauthenticated" });
    mocks.resolveOnboardingIntent.mockResolvedValue(invitation);
  });

  it("passes the inviter and the invited workspace to the form", async () => {
    const result = await SignUpPage({ searchParams: Promise.resolve({ intent: "signed.intent" }) });

    expect(result.props.children.props).toMatchObject({
      invitationIntent: "signed.intent",
      inviterName: "Invite Admin",
      workspaceName: "Hoffmann Consulting",
    });
  });

  it("passes no workspace name to a plain sign-up", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue({ status: "absent" });

    const result = await SignUpPage({ searchParams: Promise.resolve({}) });

    expect(result.props.children.props.inviterName).toBeUndefined();
    expect(result.props.children.props.workspaceName).toBeUndefined();
  });
});
