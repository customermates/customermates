import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { decodeOnboardingIntent, onboardingIntentSigningSecret } from "../../onboarding-intent-codec";
import { OnboardingIntentService } from "../../onboarding-intent.service";

const now = new Date("2026-09-04T12:00:00.000Z");
const inviteExpiresAt = new Date(now.getTime() + 60 * 60_000);
const validateInvite = vi.fn();

function validInvitation(companyId = "company-a") {
  return { ok: true, data: { companyId, expiresAt: inviteExpiresAt, inviterName: `${companyId} Admin`, valid: true } };
}

describe("OnboardingIntentService", () => {
  let service: OnboardingIntentService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    validateInvite.mockResolvedValue(validInvitation());
    service = new OnboardingIntentService({ invoke: validateInvite } as never, "resolver-test-secret");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("makes the explicit tab invitation authoritative over a legacy cookie", async () => {
    const intent = service.issueInvitation("invite-a", inviteExpiresAt);
    if (!intent) throw new Error("Expected invitation intent");

    await expect(service.resolve(intent, "invite-b")).resolves.toMatchObject({
      companyId: "company-a",
      intent,
      source: "explicit",
      status: "valid",
      token: "invite-a",
      type: "invitation",
    });
    expect(validateInvite).toHaveBeenCalledExactlyOnceWith({ token: "invite-a" });
  });

  it.each(["", ["one", "two"]] as const)("fails closed for an invalid explicit value", async (value) => {
    await expect(service.resolve(value, "legacy-invite")).resolves.toEqual({
      errorMessage: "invalidOnboardingIntent",
      source: "explicit",
      status: "invalid",
    });
    expect(validateInvite).not.toHaveBeenCalled();
  });

  it("fails closed for a tampered explicit value", async () => {
    const intent = service.issueCreateCompany("auth-user-one");

    await expect(service.resolve(`${intent}tampered`, "legacy-invite")).resolves.toEqual({
      errorMessage: "invalidOnboardingIntent",
      source: "explicit",
      status: "invalid",
    });
  });

  it("fails closed for an expired explicit value", async () => {
    const intent = service.issueCreateCompany("auth-user-one");
    vi.setSystemTime(new Date(now.getTime() + 2 * 60 * 60_000 + 1));

    await expect(service.resolve(intent)).resolves.toEqual({
      errorMessage: "onboardingSessionExpired",
      source: "explicit",
      status: "invalid",
    });
  });

  it("revalidates an explicit invitation and rejects a revoked token", async () => {
    const intent = service.issueInvitation("invite-a", inviteExpiresAt);
    if (!intent) throw new Error("Expected invitation intent");
    validateInvite.mockResolvedValue({ ok: true, data: { errorMessage: "invalidInviteLink", valid: false } });

    await expect(service.resolve(intent)).resolves.toEqual({
      errorMessage: "invalidInviteLink",
      source: "explicit",
      status: "invalid",
    });
  });

  it("converts the rollout cookie into a signed invitation", async () => {
    validateInvite.mockResolvedValue(validInvitation("legacy-company"));

    const resolved = await service.resolve(undefined, "legacy-invite");

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
    validateInvite.mockResolvedValue({
      ok: true,
      data: { companyId: "legacy-company", expiresAt: now, inviterName: "Legacy Admin", valid: true },
    });

    await expect(service.resolve(undefined, "legacy-invite")).resolves.toEqual({
      errorMessage: "inviteLinkExpired",
      source: "legacy",
      status: "invalid",
    });
  });

  it("decodes a create decision without consulting invitation state", async () => {
    const intent = service.issueCreateCompany("auth-user-one");

    await expect(service.resolve(intent)).resolves.toEqual({
      authUserId: "auth-user-one",
      intent,
      source: "explicit",
      status: "valid",
      type: "createCompany",
    });
    expect(validateInvite).not.toHaveBeenCalled();
  });

  it("reports absence only when neither source contains an intent", async () => {
    await expect(service.resolve()).resolves.toEqual({ status: "absent" });
  });
});
