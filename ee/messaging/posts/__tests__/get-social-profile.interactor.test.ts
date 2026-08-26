import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, createMockDiModule, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
  getLocale: () => Promise.resolve("en"),
}));

const { GetSocialProfileInteractor } = await import("../get-social-profile.interactor");

const INPUT = {
  connectedAccountId: "11111111-1111-4111-8111-111111111111",
  identifier: "1035",
  profileType: "company" as const,
};

function make(provider: "linkedin" | "instagram") {
  const accountRepo = {
    findUsableAccountByIdOrThrow: vi.fn().mockResolvedValue({
      provider,
      unipileAccountId: "acc_1",
    }),
  };
  const messagingService = {
    getSocialProfile: vi.fn().mockResolvedValue({
      ok: true,
      data: { object: "CompanyProfile", id: "1035", type: "organization", display_name: "Example" },
    }),
  };
  const entitlements = { require: vi.fn().mockResolvedValue(null) };

  const interactor = new GetSocialProfileInteractor(
    accountRepo as never,
    messagingService as never,
    entitlements as never,
  );

  return { interactor, messagingService };
}

beforeEach(() => vi.clearAllMocks());

describe("company social profile provider guard", () => {
  it("rejects company lookup through Instagram before calling Unipile", async () => {
    const { interactor, messagingService } = make("instagram");

    const result: { ok: boolean; error?: { issues: { message: string }[] } } = await interactor.invoke(INPUT);

    expect(result.ok).toBe(false);
    expect(result.error?.issues[0].message).toBe("Common.errors.linkedinProductRequiresLinkedin");
    expect(messagingService.getSocialProfile).not.toHaveBeenCalled();
  });

  it("routes company lookup through a LinkedIn account", async () => {
    const { interactor, messagingService } = make("linkedin");

    const result = await interactor.invoke(INPUT);

    expect(result.ok).toBe(true);
    expect(messagingService.getSocialProfile).toHaveBeenCalledWith({
      accountId: "acc_1",
      identifier: "1035",
      profileType: "company",
    });
  });

  it("rejects a misspelled profileType instead of defaulting to a person lookup", async () => {
    const { interactor, messagingService } = make("linkedin");

    const result = await interactor.invoke({
      connectedAccountId: INPUT.connectedAccountId,
      identifier: INPUT.identifier,
      profiletype: "company",
    } as never);

    expect(result.ok).toBe(false);
    expect(messagingService.getSocialProfile).not.toHaveBeenCalled();
  });
});
