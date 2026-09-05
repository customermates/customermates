import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ getSession: vi.fn(), issueInvitation: vi.fn(), validateInvite: vi.fn() }));

vi.mock("@/core/di", async () => {
  const { OpenInvitationInteractor } = await import("@/features/company/open-invitation.interactor");
  return {
    getOpenInvitationInteractor: () =>
      new OpenInvitationInteractor(
        { invoke: auth.validateInvite } as never,
        { getSession: auth.getSession } as never,
        { issueInvitation: auth.issueInvitation } as never,
      ),
  };
});
vi.mock("@/env", () => ({
  env: {
    AUTH_ALLOWED_HOSTS: ["customermates-git-feat-inbox-customermates.vercel.app", "*.customermates.com"],
    BASE_URL: "https://customermates-git-feat-inbox-customermates.vercel.app",
    BETTER_AUTH_SECRET: "route-test-secret",
  },
}));

import { GET } from "../route";
import {
  decodeOnboardingIntent,
  encodeInvitationOnboardingIntent,
  onboardingIntentSigningSecret,
} from "@/features/company/onboarding-intent-codec";

const expiresAt = new Date("2099-01-01T00:00:00.000Z");

function invitationFrom(response: Response) {
  const location = new URL(response.headers.get("location") ?? "");
  const intent = location.searchParams.get("intent") ?? undefined;
  const secret = onboardingIntentSigningSecret("route-test-secret");
  if (!secret) throw new Error("Missing test signing secret");
  return { decoded: decodeOnboardingIntent(intent, secret), intent, location };
}

function expectLegacyCookieCleared(response: Response) {
  expect(response.headers.get("set-cookie")).toContain("inviteToken=");
  expect(response.headers.get("set-cookie")).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
}

describe("invitation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.getSession.mockResolvedValue(null);
    auth.issueInvitation.mockImplementation((token: string, invitationExpiresAt: Date, now?: Date) => {
      const secret = onboardingIntentSigningSecret("route-test-secret");
      if (!secret) throw new Error("Missing test signing secret");
      return encodeInvitationOnboardingIntent(token, invitationExpiresAt, secret, now);
    });
    auth.validateInvite.mockResolvedValue({
      ok: true,
      data: { companyId: "invited-company", expiresAt, inviterName: "Invite Admin", valid: true },
    });
  });

  it("keeps signup and its signed invitation on the validated vanity origin", async () => {
    const response = await GET(new Request("https://feat-inbox.customermates.com/en/invitation/invite-token"), {
      params: Promise.resolve({ locale: "en", token: "invite-token" }),
    });
    const invitation = invitationFrom(response);

    expect(invitation.location.origin).toBe("https://feat-inbox.customermates.com");
    expect(invitation.location.pathname).toBe("/en/auth/signup");
    expect(invitation.decoded).toMatchObject({
      payload: { token: "invite-token", type: "invitation" },
      status: "valid",
    });
    expectLegacyCookieCleared(response);
  });

  it("clears a stale legacy invitation when the token is schema-rejected", async () => {
    auth.validateInvite.mockResolvedValue({ ok: false, error: new Error("invalid") });

    const response = await GET(new Request("https://feat-inbox.customermates.com/en/invitation/%7Btoken%7D"), {
      params: Promise.resolve({ locale: "en", token: "{token}" }),
    });

    expect(response.headers.get("location")).toBe(
      "https://feat-inbox.customermates.com/en/auth/error?type=invalidInviteLink",
    );
    expectLegacyCookieCleared(response);
  });

  it("sends a signed-in visitor to the invitation explanation with the signed intent", async () => {
    auth.getSession.mockResolvedValue({ user: { email: "invited@example.com", emailVerified: true } });

    const response = await GET(new Request("https://feat-inbox.customermates.com/en/invitation/invite-token"), {
      params: Promise.resolve({ locale: "en", token: "invite-token" }),
    });
    const invitation = invitationFrom(response);

    expect(auth.validateInvite).toHaveBeenCalledWith({ token: "invite-token" });
    expect(invitation.location.pathname).toBe("/en/auth/invitation");
    expect(invitation.decoded).toMatchObject({
      payload: { token: "invite-token", type: "invitation" },
      status: "valid",
    });
    expectLegacyCookieCleared(response);
  });

  it("keeps the invitation for a signed-in visitor who has not verified their email", async () => {
    auth.getSession.mockResolvedValue({ user: { email: "invited@example.com", emailVerified: false } });

    const response = await GET(new Request("https://feat-inbox.customermates.com/en/invitation/invite-token"), {
      params: Promise.resolve({ locale: "en", token: "invite-token" }),
    });

    expect(invitationFrom(response).location.pathname).toBe("/en/auth/invitation");
    expectLegacyCookieCleared(response);
  });

  it("sends an expired token to the error page and clears a stale legacy invitation", async () => {
    auth.getSession.mockResolvedValue({ user: { email: "invited@example.com", emailVerified: true } });
    auth.validateInvite.mockResolvedValue({ ok: true, data: { valid: false, errorMessage: "inviteLinkExpired" } });

    const response = await GET(new Request("https://feat-inbox.customermates.com/en/invitation/invite-token"), {
      params: Promise.resolve({ locale: "en", token: "invite-token" }),
    });

    expect(response.headers.get("location")).toBe(
      "https://feat-inbox.customermates.com/en/auth/error?type=inviteLinkExpired",
    );
    expect(auth.getSession).not.toHaveBeenCalled();
    expectLegacyCookieCleared(response);
  });

  it("fails closed if the invitation expires between validation and intent issuance", async () => {
    auth.validateInvite.mockResolvedValue({
      ok: true,
      data: { companyId: "invited-company", expiresAt: new Date(0), inviterName: "Invite Admin", valid: true },
    });

    const response = await GET(new Request("https://feat-inbox.customermates.com/en/invitation/invite-token"), {
      params: Promise.resolve({ locale: "en", token: "invite-token" }),
    });

    expect(response.headers.get("location")).toBe(
      "https://feat-inbox.customermates.com/en/auth/error?type=inviteLinkExpired",
    );
    expectLegacyCookieCleared(response);
  });

  it("falls back to the stable branch origin for an untrusted request host", async () => {
    const response = await GET(new Request("https://attacker.example/en/invitation/invite-token"), {
      params: Promise.resolve({ locale: "en", token: "invite-token" }),
    });

    const invitation = invitationFrom(response);
    expect(invitation.location.origin).toBe("https://customermates-git-feat-inbox-customermates.vercel.app");
    expect(invitation.location.pathname).toBe("/en/auth/signup");
    expect(invitation.intent).toBeTruthy();
  });
});
