import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  validateInvite: vi.fn(),
}));

vi.mock("@/core/di", () => ({
  getAuthService: () => ({ getSession: auth.getSession }),
  getInviteTokenValidationInteractor: () => ({ invoke: auth.validateInvite }),
}));
vi.mock("@/env", () => ({
  env: {
    BASE_URL: "https://customermates-git-feat-inbox-customermates.vercel.app",
    AUTH_ALLOWED_HOSTS: ["customermates-git-feat-inbox-customermates.vercel.app", "*.customermates.com"],
  },
}));

import { GET } from "../route";

describe("invitation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.getSession.mockResolvedValue(null);
    auth.validateInvite.mockResolvedValue({ ok: true, data: { valid: true } });
  });

  it("keeps signup and its invitation cookie on the validated vanity origin", async () => {
    const response = await GET(new Request("https://feat-inbox.customermates.com/en/invitation/invite-token"), {
      params: Promise.resolve({ locale: "en", token: "invite-token" }),
    });

    expect(response.headers.get("location")).toBe("https://feat-inbox.customermates.com/en/auth/signup");
    expect(response.headers.get("set-cookie")).toContain("inviteToken=invite-token");
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("sends a schema-rejected token to the invalid invite link page", async () => {
    auth.validateInvite.mockResolvedValue({ ok: false, error: new Error("invalid") });

    const response = await GET(new Request("https://feat-inbox.customermates.com/en/invitation/%7Btoken%7D"), {
      params: Promise.resolve({ locale: "en", token: "{token}" }),
    });

    expect(response.headers.get("location")).toBe(
      "https://feat-inbox.customermates.com/en/auth/error?type=invalidInviteLink",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("falls back to the stable branch origin for an untrusted request host", async () => {
    const response = await GET(new Request("https://attacker.example/en/invitation/invite-token"), {
      params: Promise.resolve({ locale: "en", token: "invite-token" }),
    });

    expect(response.headers.get("location")).toBe(
      "https://customermates-git-feat-inbox-customermates.vercel.app/en/auth/signup",
    );
  });
});
