import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);

import { InviteTokenValidationInteractor } from "../invite-token-validation.interactor";

const repo = { findTokenUnscoped: vi.fn() };

function interactor() {
  return new InviteTokenValidationInteractor(repo);
}

describe("InviteTokenValidationInteractor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(["{token}", "has spaces", "slash/token", "%7Btoken%7D"])(
    "rejects the malformed token %s without throwing",
    async (token) => {
      const result = await interactor().invoke({ token });

      expect(result.ok).toBe(false);
      expect(repo.findTokenUnscoped).not.toHaveBeenCalled();
    },
  );

  it("reports a missing token as an invalid invite link", async () => {
    const result = await interactor().invoke({});

    expect(result).toEqual({ ok: true, data: { valid: false, errorMessage: "invalidInviteLink" } });
    expect(repo.findTokenUnscoped).not.toHaveBeenCalled();
  });

  it("reports an unknown but well-formed token as an invalid invite link", async () => {
    repo.findTokenUnscoped.mockResolvedValue(null);

    const result = await interactor().invoke({ token: "unknownbutwellformed" });

    expect(repo.findTokenUnscoped).toHaveBeenCalledWith("unknownbutwellformed");
    expect(result).toEqual({ ok: true, data: { valid: false, errorMessage: "invalidInviteLink" } });
  });

  it("looks up a well-formed token", async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    repo.findTokenUnscoped.mockResolvedValue({
      companyId: "00000000-0000-4000-8000-000000000001",
      createdBy: { email: "admin@example.com", firstName: "Invite", lastName: "Admin" },
      expiresAt,
    });

    const result = await interactor().invoke({ token: "well-formed_TOKEN123" });

    expect(repo.findTokenUnscoped).toHaveBeenCalledWith("well-formed_TOKEN123");
    expect(result).toEqual({
      ok: true,
      data: {
        companyId: "00000000-0000-4000-8000-000000000001",
        expiresAt,
        inviterName: "Invite Admin",
        valid: true,
      },
    });
  });

  it("reports an expired token as an expired invite link", async () => {
    repo.findTokenUnscoped.mockResolvedValue({
      companyId: "00000000-0000-4000-8000-000000000001",
      expiresAt: new Date(Date.now() - 60_000),
    });

    const result = await interactor().invoke({ token: "expired-token" });

    expect(result).toEqual({ ok: true, data: { valid: false, errorMessage: "inviteLinkExpired" } });
  });

  it("treats the exact expiry instant as expired", async () => {
    const now = new Date("2026-09-04T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    repo.findTokenUnscoped.mockResolvedValue({
      companyId: "00000000-0000-4000-8000-000000000001",
      createdBy: { email: "admin@example.com", firstName: "Invite", lastName: "Admin" },
      expiresAt: now,
    });

    await expect(interactor().invoke({ token: "exact-expiry" })).resolves.toEqual({
      ok: true,
      data: { valid: false, errorMessage: "inviteLinkExpired" },
    });
  });

  it("falls back to the inviter email when no name is available", async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    repo.findTokenUnscoped.mockResolvedValue({
      companyId: "00000000-0000-4000-8000-000000000001",
      createdBy: { email: "admin@example.com", firstName: "", lastName: "" },
      expiresAt,
    });

    await expect(interactor().invoke({ token: "email-fallback" })).resolves.toEqual({
      ok: true,
      data: {
        companyId: "00000000-0000-4000-8000-000000000001",
        expiresAt,
        inviterName: "admin@example.com",
        valid: true,
      },
    });
  });
});
