import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readInviteTokenCookie: vi.fn(),
  validateInvite: vi.fn(),
}));

vi.mock("@/core/di", () => ({
  getInviteTokenValidationInteractor: () => ({ invoke: mocks.validateInvite }),
}));
vi.mock("@/env", () => ({ env: { BETTER_AUTH_SECRET: "resolver-test-secret" } }));
vi.mock("../invite-token-cookie", () => ({
  readInviteTokenCookie: mocks.readInviteTokenCookie,
}));

import {
  issueCreateCompanyOnboardingIntent,
  issueInvitationOnboardingIntent,
  resolveOnboardingIntent,
} from "../onboarding-intent";
import { decodeOnboardingIntent, onboardingIntentSigningSecret } from "../../onboarding-intent-codec";

const now = new Date("2026-09-04T12:00:00.000Z");
const inviteExpiresAt = new Date(now.getTime() + 60 * 60_000);

function validInvitation(companyId = "company-a") {
  return {
    ok: true,
    data: {
      companyId,
      expiresAt: inviteExpiresAt,
      inviterName: `${companyId} Admin`,
      valid: true,
    },
  };
}

describe("resolveOnboardingIntent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mocks.readInviteTokenCookie.mockResolvedValue(undefined);
    mocks.validateInvite.mockResolvedValue(validInvitation());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("makes the explicit tab invitation authoritative over a legacy cookie", async () => {
    mocks.readInviteTokenCookie.mockResolvedValue("invite-b");
    const intent = issueInvitationOnboardingIntent("invite-a", inviteExpiresAt);
    if (!intent) throw new Error("Expected invitation intent");

    await expect(resolveOnboardingIntent(intent)).resolves.toMatchObject({
      companyId: "company-a",
      intent,
      source: "explicit",
      status: "valid",
      token: "invite-a",
      type: "invitation",
    });
    expect(mocks.validateInvite).toHaveBeenCalledWith({ token: "invite-a" });
    expect(mocks.readInviteTokenCookie).not.toHaveBeenCalled();
  });

  it.each(["", ["one", "two"]] as const)(
    "fails closed for an empty or duplicate explicit query value",
    async (value) => {
      const queryValue: string | string[] = typeof value === "string" ? value : Array.from(value);
      await expect(resolveOnboardingIntent(queryValue)).resolves.toEqual({
        errorMessage: "invalidOnboardingIntent",
        source: "explicit",
        status: "invalid",
      });
      expect(mocks.readInviteTokenCookie).not.toHaveBeenCalled();
      expect(mocks.validateInvite).not.toHaveBeenCalled();
    },
  );

  it("fails closed for a tampered explicit value without reading the cookie", async () => {
    const intent = issueCreateCompanyOnboardingIntent("auth-user-one");

    await expect(resolveOnboardingIntent(`${intent}tampered`)).resolves.toEqual({
      errorMessage: "invalidOnboardingIntent",
      source: "explicit",
      status: "invalid",
    });
    expect(mocks.readInviteTokenCookie).not.toHaveBeenCalled();
  });

  it("fails closed for an expired explicit value without reading the cookie", async () => {
    const intent = issueCreateCompanyOnboardingIntent("auth-user-one");
    vi.setSystemTime(new Date(now.getTime() + 2 * 60 * 60_000 + 1));

    await expect(resolveOnboardingIntent(intent)).resolves.toEqual({
      errorMessage: "onboardingSessionExpired",
      source: "explicit",
      status: "invalid",
    });
    expect(mocks.readInviteTokenCookie).not.toHaveBeenCalled();
  });

  it("revalidates an explicit invitation and rejects a revoked token", async () => {
    const intent = issueInvitationOnboardingIntent("invite-a", inviteExpiresAt);
    if (!intent) throw new Error("Expected invitation intent");
    mocks.validateInvite.mockResolvedValue({
      ok: true,
      data: { errorMessage: "invalidInviteLink", valid: false },
    });

    await expect(resolveOnboardingIntent(intent)).resolves.toEqual({
      errorMessage: "invalidInviteLink",
      source: "explicit",
      status: "invalid",
    });
  });

  it("converts the rollout cookie into a signed invitation", async () => {
    mocks.readInviteTokenCookie.mockResolvedValue("legacy-invite");
    mocks.validateInvite.mockResolvedValue(validInvitation("legacy-company"));

    const resolved = await resolveOnboardingIntent();

    expect(resolved).toMatchObject({
      companyId: "legacy-company",
      source: "legacy",
      status: "valid",
      token: "legacy-invite",
      type: "invitation",
    });
    if (resolved.status !== "valid") throw new Error("Expected a valid legacy invitation");
    const secret = onboardingIntentSigningSecret("resolver-test-secret");
    if (!secret) throw new Error("Missing test signing secret");
    expect(decodeOnboardingIntent(resolved.intent, secret, now)).toMatchObject({
      payload: { token: "legacy-invite", type: "invitation" },
      status: "valid",
    });
  });

  it("fails closed if a rollout invitation expires during reissuance", async () => {
    mocks.readInviteTokenCookie.mockResolvedValue("legacy-invite");
    mocks.validateInvite.mockResolvedValue({
      ok: true,
      data: {
        companyId: "legacy-company",
        expiresAt: now,
        inviterName: "Legacy Admin",
        valid: true,
      },
    });

    await expect(resolveOnboardingIntent()).resolves.toEqual({
      errorMessage: "inviteLinkExpired",
      source: "legacy",
      status: "invalid",
    });
  });

  it("decodes a create decision without consulting invitation state", async () => {
    const intent = issueCreateCompanyOnboardingIntent("auth-user-one");

    await expect(resolveOnboardingIntent(intent)).resolves.toEqual({
      authUserId: "auth-user-one",
      intent,
      source: "explicit",
      status: "valid",
      type: "createCompany",
    });
    expect(mocks.readInviteTokenCookie).not.toHaveBeenCalled();
    expect(mocks.validateInvite).not.toHaveBeenCalled();
  });

  it("reports absence only when neither URL nor rollout cookie contains an intent", async () => {
    await expect(resolveOnboardingIntent()).resolves.toEqual({ status: "absent" });
  });
});
