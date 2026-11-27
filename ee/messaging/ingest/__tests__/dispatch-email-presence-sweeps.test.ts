import { describe, expect, it, vi } from "vitest";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => ({ ...createMockDiModule(() => mockUser) }));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { DispatchEmailPresenceSweepsInteractor } from "../dispatch-email-presence-sweeps.interactor";

describe("dispatching the daily email presence sweeps", () => {
  it("starts a sweep for every IMAP account and keeps going past a failed start", async () => {
    const repo = {
      findAccountsForEmailPresenceSweepUnscoped: vi.fn().mockResolvedValue([
        { id: "account-a", companyId: "company-1" },
        { id: "account-b", companyId: "company-1" },
        { id: "account-c", companyId: "company-2" },
      ]),
    };
    const background = {
      dispatch: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("workflow start failed"))
        .mockResolvedValueOnce(undefined),
    };

    const result = await new DispatchEmailPresenceSweepsInteractor(repo as never, background as never).invoke();

    expect(result).toEqual({ dispatched: 2, failed: 1 });
    expect(background.dispatch.mock.calls).toEqual([
      ["sweep-email-presence", { connectedAccountId: "account-a" }],
      ["sweep-email-presence", { connectedAccountId: "account-b" }],
      ["sweep-email-presence", { connectedAccountId: "account-c" }],
    ]);
  });
});
