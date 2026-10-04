import { describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { mockEntitlementService } from "@/tests/helpers/mock-entitlement-service";
import {
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
  createMockDiModule,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { RefreshInboxInteractor } from "../refresh-inbox.interactor";

describe("RefreshInboxInteractor outcome", () => {
  it("asks only the owner to reconnect, and counts a colleague's broken shared channel as not refreshed", async () => {
    const repo = {
      listAccountsForRefresh: vi.fn().mockResolvedValue([
        { id: "healthy-but-failing", userId: mockUser.id, unipileAccountId: "u-1", status: "ok" },
        { id: "needs-credentials", userId: mockUser.id, unipileAccountId: "u-2", status: "credentials" },
        { id: "needs-permissions", userId: mockUser.id, unipileAccountId: "u-3", status: "permissions" },
        { id: "still-connecting", userId: mockUser.id, unipileAccountId: "u-4", status: "connecting" },
        { id: "colleague-shared", userId: "colleague", unipileAccountId: "u-5", status: "credentials" },
      ]),
      claimBackfillUnscoped: vi.fn().mockResolvedValue("token"),
      releaseBackfillClaimUnscoped: vi.fn().mockResolvedValue(undefined),
    };
    const prepare = { invoke: vi.fn().mockRejectedValue(new Error("provider unavailable")) };

    const result = await new RefreshInboxInteractor(
      repo as never,
      prepare as never,
      { invoke: vi.fn() } as never,
      { invoke: vi.fn() } as never,
      mockEntitlementService(),
    ).invoke();

    expect(result).toEqual({
      ok: true,
      data: { rateLimited: false, retryAfterSeconds: null, reconnectAccounts: 2, failedAccounts: 2 },
    });
    expect(prepare.invoke).toHaveBeenCalledOnce();
  });
});
