import { beforeEach, describe, expect, it, vi } from "vitest";

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

  it.each(["{token}", "has spaces", "slash/token", "%7Btoken%7D"])(
    "reports the malformed token %s as invalid rather than throwing",
    async (token) => {
      const result = await interactor().invoke({ token });

      expect(result.data).toEqual({ valid: false, errorMessage: "invalidInviteLink" });
      expect(repo.findTokenUnscoped).not.toHaveBeenCalled();
    },
  );

  it("reports a missing token as invalid", async () => {
    const result = await interactor().invoke({});

    expect(result.data).toEqual({ valid: false, errorMessage: "invalidInviteLink" });
    expect(repo.findTokenUnscoped).not.toHaveBeenCalled();
  });

  it("looks up a well-formed token", async () => {
    repo.findTokenUnscoped.mockResolvedValue({
      companyId: "00000000-0000-4000-8000-000000000001",
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await interactor().invoke({ token: "well-formed_TOKEN123" });

    expect(repo.findTokenUnscoped).toHaveBeenCalledWith("well-formed_TOKEN123");
    expect(result.data).toEqual({ valid: true, companyId: "00000000-0000-4000-8000-000000000001" });
  });

  it("reports an expired token as invalid", async () => {
    repo.findTokenUnscoped.mockResolvedValue({
      companyId: "00000000-0000-4000-8000-000000000001",
      expiresAt: new Date(Date.now() - 60_000),
    });

    const result = await interactor().invoke({ token: "expired-token" });

    expect(result.data).toEqual({ valid: false, errorMessage: "inviteLinkExpired" });
  });
});
