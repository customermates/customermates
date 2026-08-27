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
const translations = vi.hoisted(() => ({ threadNotFound: "Conversazione non trovata" }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: (namespace?: string) => {
    const t = (key: string) =>
      `${namespace ? `${namespace}.` : ""}${key}` === "Common.errors.threadNotFound"
        ? translations.threadNotFound
        : `${namespace ? `${namespace}.` : ""}${key}`;
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
  getLocale: () => Promise.resolve("en"),
}));

import { CustomErrorCode } from "@/core/validation/validation.types";
import { GetMessagingThreadInteractor } from "../get-messaging-thread.interactor";

const THREAD_ID = "00000000-0000-4000-8000-000000000001";

describe("GetMessagingThreadInteractor", () => {
  it("returns a coded, localized error when the thread does not exist", async () => {
    const repo = {
      findThreadById: vi.fn().mockResolvedValue(null),
      listMessagesForThread: vi.fn(),
    };
    const accountRepo = { listAccountOwnersByIds: vi.fn() };

    const result = await new GetMessagingThreadInteractor(repo, accountRepo, mockEntitlementService()).invoke({
      threadId: THREAD_ID,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.issues[0]).toMatchObject({
      message: translations.threadNotFound,
      params: { error: CustomErrorCode.threadNotFound },
    });
    expect(repo.listMessagesForThread).not.toHaveBeenCalled();
    expect(accountRepo.listAccountOwnersByIds).not.toHaveBeenCalled();
  });
});
