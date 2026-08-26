import { describe, it, expect, vi, beforeEach } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => ({ env: { ...MOCK_ENV_MODULE.env, APP_MODE: "cloud" } }));
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
  getLocale: () => Promise.resolve("en"),
}));

const { LinkedinBrowseSalesListInteractor } = await import("../linkedin-browse-sales-list.interactor");

const VALID_INPUT = {
  connectedAccountId: "11111111-1111-4111-8111-111111111111",
  kind: "leads" as const,
  listId: "list-1",
  limit: 10,
};

function make(linkedinProducts: string[]) {
  const accountRepo = {
    findUsableAccountByIdOrThrow: vi.fn().mockResolvedValue({
      provider: "linkedin",
      unipileAccountId: "acc_1",
      linkedinProducts,
    }),
  };
  const messagingService = {
    browseSalesList: vi.fn().mockResolvedValue({ ok: true, data: { items: [], cursor: null } }),
  };
  const entitlements = { require: vi.fn().mockResolvedValue(null) };

  const interactor = new LinkedinBrowseSalesListInteractor(
    accountRepo as never,
    messagingService as never,
    entitlements as never,
  );

  return { interactor, accountRepo, messagingService };
}

beforeEach(() => vi.clearAllMocks());

describe("Sales Navigator access guard", () => {
  it("blocks a known LinkedIn account that lacks Sales Navigator, before calling Unipile", async () => {
    const { interactor, messagingService } = make(["classic"]);

    const res: { ok: boolean; error?: { issues: { message: string }[] } } = await interactor.invoke(VALID_INPUT);

    expect(res.ok).toBe(false);
    expect(res.error?.issues[0].message).toBe("Common.errors.salesNavigatorNotAvailable");
    expect(messagingService.browseSalesList).not.toHaveBeenCalled();
  });

  it("proceeds to Unipile when the account has Sales Navigator", async () => {
    const { interactor, messagingService } = make(["classic", "sales_navigator"]);

    await interactor.invoke(VALID_INPUT).catch(() => undefined);

    expect(messagingService.browseSalesList).toHaveBeenCalled();
  });

  it("does not block when products are unknown yet (pre-backfill empty array)", async () => {
    const { interactor, messagingService } = make([]);

    await interactor.invoke(VALID_INPUT).catch(() => undefined);

    expect(messagingService.browseSalesList).toHaveBeenCalled();
  });
});
