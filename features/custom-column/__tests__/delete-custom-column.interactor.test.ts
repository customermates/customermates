import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
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

import { CustomColumnType, EntityType } from "@/generated/prisma";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { DomainEvent } from "@/features/event/domain-events";

import { DeleteCustomColumnInteractor } from "../delete-custom-column.interactor";

const CUSTOM_COLUMN_ID = "00000000-0000-4000-8000-000000000001";

function makeInteractor(referenced: boolean) {
  const customColumn = {
    id: CUSTOM_COLUMN_ID,
    label: "Customer tier",
    type: CustomColumnType.plain,
    entityType: EntityType.contact,
  } as const;
  const repo = {
    findByIdOrThrow: vi.fn().mockResolvedValue(customColumn),
    delete: vi.fn().mockResolvedValue({ id: CUSTOM_COLUMN_ID }),
  };
  const routineRepo = {
    hasRoutineFilterReference: vi.fn().mockResolvedValue(referenced),
  };
  const userService = {
    hasPermissionOrThrow: vi.fn().mockResolvedValue(undefined),
  };
  const eventService = { publish: vi.fn().mockResolvedValue(undefined) };
  const validator = { invoke: vi.fn().mockResolvedValue(undefined) };

  return {
    interactor: new DeleteCustomColumnInteractor(
      repo as never,
      routineRepo as never,
      userService as never,
      eventService as never,
      validator as never,
    ),
    repo,
    routineRepo,
    eventService,
  };
}

describe("DeleteCustomColumnInteractor routine dependencies", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects deletion without changing another owner's routine when the column is referenced", async () => {
    const { interactor, repo, routineRepo, eventService } = makeInteractor(true);

    const result = await interactor.invoke({ id: CUSTOM_COLUMN_ID });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected deletion to be rejected");
    expect(result.error.issues[0]).toMatchObject({
      path: ["id"],
      params: {
        error: CustomErrorCode.customColumnUsedByRoutineCannotDelete,
        kind: "conflict",
      },
    });
    expect(routineRepo.hasRoutineFilterReference).toHaveBeenCalledWith(CUSTOM_COLUMN_ID);
    expect(repo.delete).not.toHaveBeenCalled();
    expect(eventService.publish).not.toHaveBeenCalled();
  });

  it("deletes and publishes normally when no routine references the column", async () => {
    const { interactor, repo, routineRepo, eventService } = makeInteractor(false);

    await expect(interactor.invoke({ id: CUSTOM_COLUMN_ID })).resolves.toEqual({
      ok: true,
      data: CUSTOM_COLUMN_ID,
    });

    expect(routineRepo.hasRoutineFilterReference).toHaveBeenCalledWith(CUSTOM_COLUMN_ID);
    expect(repo.delete).toHaveBeenCalledWith(CUSTOM_COLUMN_ID);
    expect(eventService.publish).toHaveBeenCalledWith(DomainEvent.CUSTOM_COLUMN_DELETED, {
      entityId: CUSTOM_COLUMN_ID,
      payload: expect.objectContaining({ id: CUSTOM_COLUMN_ID }),
    });
  });
});
