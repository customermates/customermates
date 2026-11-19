import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUnauthenticated: vi.fn(),
  resolveAccountState: vi.fn(),
  resolveOnboardingIntent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next-intl/server", () => ({ getLocale: () => Promise.resolve("en") }));
vi.mock("@/features/auth/next/require", () => ({
  requireUnauthenticated: mocks.requireUnauthenticated,
}));
vi.mock("@/features/auth/next/resolve-account-state", () => ({
  resolveRequestAccountState: mocks.resolveAccountState,
}));
vi.mock("@/features/company/next/onboarding-intent", () => ({
  resolveOnboardingIntent: mocks.resolveOnboardingIntent,
}));

import { resolveSignInEntry, searchParamsOf } from "../sign-in-entry";

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

const entry = (search: string) => resolveSignInEntry(searchParamsOf(search));

describe("sign-in entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUnauthenticated.mockResolvedValue(undefined);
    mocks.resolveAccountState.mockResolvedValue({ sessionUser: null, state: "unauthenticated" });
    mocks.resolveOnboardingIntent.mockResolvedValue({ status: "absent" });
  });

  it("reads the location search the way a page receives its search parameters", () => {
    expect(searchParamsOf("")).toEqual({});
    expect(searchParamsOf("?callbackURL=%2Fen%2Fdashboard&intent=a&intent=b&intent=c")).toEqual({
      callbackURL: "/en/dashboard",
      intent: ["a", "b", "c"],
    });
  });

  it("passes a plain callback through and asks for the legacy invitation when the link names no intent", async () => {
    expect(await entry("?callbackURL=%2Fen%2Fw%2Facme%2Finbox")).toEqual({
      callbackURL: "/en/w/acme/inbox",
      inviterName: undefined,
      onboardingIntent: undefined,
      workspaceName: undefined,
    });
    expect(mocks.resolveOnboardingIntent).toHaveBeenCalledWith(undefined);
    expect(mocks.requireUnauthenticated).toHaveBeenCalledOnce();
  });

  it("sends an already signed-in visitor on instead of answering", async () => {
    mocks.requireUnauthenticated.mockRejectedValue(new Error("REDIRECT:/en"));

    await expect(entry("")).rejects.toThrow("REDIRECT:/en");
  });

  it("recovers an invitation nested in a proxy callback URL", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue(invitation);

    expect(await entry(`?callbackURL=${encodeURIComponent("/onboarding/wizard?intent=signed.intent")}`)).toEqual({
      callbackURL: "/auth/invitation?intent=signed.intent",
      inviterName: "Invite Admin",
      onboardingIntent: "signed.intent",
      workspaceName: "Hoffmann Consulting",
    });
    expect(mocks.resolveOnboardingIntent).toHaveBeenCalledWith("signed.intent");
  });

  it("fails closed on duplicate nested intents instead of consulting legacy state", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue({
      errorMessage: "invalidOnboardingIntent",
      source: "explicit",
      status: "invalid",
    });

    const nested = encodeURIComponent("/auth/invitation?intent=one&intent=two");

    await expect(entry(`?callbackURL=${nested}`)).rejects.toThrow(
      "REDIRECT:/en/auth/error?type=invalidOnboardingIntent",
    );
    expect(mocks.resolveOnboardingIntent).toHaveBeenCalledWith([]);
    expect(mocks.requireUnauthenticated).not.toHaveBeenCalled();
  });

  it("fails closed on duplicate callback parameters instead of consulting legacy state", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue({
      errorMessage: "invalidOnboardingIntent",
      source: "explicit",
      status: "invalid",
    });

    await expect(entry("?callbackURL=%2Fauth%2Fsignin&callbackURL=%2Fauth%2Finvitation")).rejects.toThrow(
      "REDIRECT:/en/auth/error?type=invalidOnboardingIntent",
    );
    expect(mocks.resolveOnboardingIntent).toHaveBeenCalledWith([]);
  });

  it("routes an already signed-in visitor to the invitation explanation", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue(invitation);
    mocks.resolveAccountState.mockResolvedValue({
      sessionUser: { id: "auth-user-one" },
      state: "registered",
    });

    await expect(entry("?intent=signed.intent")).rejects.toThrow("REDIRECT:/en/auth/invitation?intent=signed.intent");
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

    const result = await entry("?intent=signed.create");

    expect(result).toMatchObject({
      callbackURL: "/onboarding/wizard?intent=signed.create",
      onboardingIntent: "signed.create",
    });
    expect(result.inviterName).toBeUndefined();
    expect(result.workspaceName).toBeUndefined();
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

    await expect(entry("?intent=signed.create")).rejects.toThrow(
      "REDIRECT:/en/auth/error?type=invalidOnboardingIntent",
    );
  });
});
