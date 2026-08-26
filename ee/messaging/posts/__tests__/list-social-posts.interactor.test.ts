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

const { ListSocialPostsInteractor } = await import("../list-social-posts.interactor");

const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";

function make() {
  const accountRepo = {
    findUsableAccountByIdOrThrow: vi.fn().mockResolvedValue({
      provider: "linkedin",
      unipileAccountId: "acc_1",
    }),
  };
  const messagingService = {
    listUserPosts: vi.fn().mockResolvedValue({
      ok: true,
      data: { data: [], total_count: 0, next_cursor: null },
    }),
  };
  const entitlements = { require: vi.fn().mockResolvedValue(null) };

  const interactor = new ListSocialPostsInteractor(
    accountRepo as never,
    messagingService as never,
    entitlements as never,
  );

  return { interactor, messagingService };
}

beforeEach(() => vi.clearAllMocks());

describe("social-post list pagination contract", () => {
  it("defaults to the account owner and limit 10 on the first page", async () => {
    const { interactor, messagingService } = make();

    const result = await interactor.invoke({
      connectedAccountId: ACCOUNT_ID,
    } as never);

    expect(result.ok).toBe(true);
    expect(messagingService.listUserPosts).toHaveBeenCalledWith({
      accountId: "acc_1",
      userId: "me",
      cursor: undefined,
      offset: undefined,
      limit: 10,
    });
  });

  it("continues a cursor page with the explicitly repeated author and limit", async () => {
    const { interactor, messagingService } = make();

    const result = await interactor.invoke({
      connectedAccountId: ACCOUNT_ID,
      authorIdentifier: "ACoAAProviderId",
      cursor: "cursor-2",
      limit: 5,
    });

    expect(result.ok).toBe(true);
    expect(messagingService.listUserPosts).toHaveBeenCalledWith({
      accountId: "acc_1",
      userId: "ACoAAProviderId",
      cursor: "cursor-2",
      offset: undefined,
      limit: 5,
    });
  });

  it("continues an offset page with the explicitly repeated author and limit", async () => {
    const { interactor, messagingService } = make();

    const result = await interactor.invoke({
      connectedAccountId: ACCOUNT_ID,
      authorIdentifier: "ACoAAProviderId",
      offset: 5,
      limit: 5,
    });

    expect(result.ok).toBe(true);
    expect(messagingService.listUserPosts).toHaveBeenCalledWith({
      accountId: "acc_1",
      userId: "ACoAAProviderId",
      cursor: undefined,
      offset: 5,
      limit: 5,
    });
  });

  it.each([
    [
      "a cursor continuation without authorIdentifier",
      { connectedAccountId: ACCOUNT_ID, cursor: "cursor-2", limit: 5 },
    ],
    [
      "a cursor continuation without limit",
      { connectedAccountId: ACCOUNT_ID, authorIdentifier: "ACoAAProviderId", cursor: "cursor-2" },
    ],
    ["offset zero", { connectedAccountId: ACCOUNT_ID, authorIdentifier: "ACoAAProviderId", offset: 0, limit: 5 }],
    [
      "cursor and offset together",
      {
        connectedAccountId: ACCOUNT_ID,
        authorIdentifier: "ACoAAProviderId",
        cursor: "cursor-2",
        offset: 5,
        limit: 5,
      },
    ],
    ["an unknown field", { connectedAccountId: ACCOUNT_ID, authorIdentifier: "me", limit: 10, unexpected: true }],
  ])("rejects %s", async (_description, data) => {
    const { interactor, messagingService } = make();

    const result = await interactor.invoke(data as never);

    expect(result.ok).toBe(false);
    expect(messagingService.listUserPosts).not.toHaveBeenCalled();
  });
});
