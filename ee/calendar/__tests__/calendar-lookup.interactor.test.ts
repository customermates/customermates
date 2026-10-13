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
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
  getLocale: () => Promise.resolve("en"),
}));

import { runWithTenant } from "@/core/decorators/tenant-context";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { serializeInteractorFailure } from "@/core/validation/validation.utils";
import { GetCalendarByIdInteractor } from "../get-calendar-by-id.interactor";
import { GetCalendarEventByIdInteractor } from "../get-calendar-event-by-id.interactor";

const ID = "10000000-0000-4000-8000-000000000001";
const entitlements = { require: vi.fn().mockResolvedValue(null) };

describe("calendar lookups by id", () => {
  it("answers an unknown or inaccessible calendar as not found", async () => {
    const repo = { getCalendarById: vi.fn().mockResolvedValue(null) };
    const result = await runWithTenant(mockUser, () =>
      new GetCalendarByIdInteractor(repo as never, entitlements as never).invoke({ id: ID }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(serializeInteractorFailure(result.error)).toMatchObject({
      kind: "not_found",
      issues: [{ path: ["id"], customCode: CustomErrorCode.calendarNotFound }],
    });
  });

  it("answers an unknown or inaccessible calendar event as not found", async () => {
    const repo = { getCalendarEventById: vi.fn().mockResolvedValue(null) };
    const result = await runWithTenant(mockUser, () =>
      new GetCalendarEventByIdInteractor(repo as never, entitlements as never).invoke({ id: ID }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(serializeInteractorFailure(result.error)).toMatchObject({
      kind: "not_found",
      issues: [{ path: ["id"], customCode: CustomErrorCode.calendarEventNotFound }],
    });
  });
});
