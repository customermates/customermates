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

import { Action, CustomColumnType, EntityType, Resource } from "@/generated/prisma";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { UpsertCustomColumnInteractor, type UpsertCustomColumnData } from "../upsert-custom-column.interactor";

const STAGE_COLUMN_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_COLUMN_ID = "00000000-0000-4000-8000-000000000002";
const QUALIFIED = "00000000-0000-4000-8000-000000000011";
const PROPOSAL = "00000000-0000-4000-8000-000000000012";
const NEW_STAGE = "00000000-0000-4000-8000-000000000013";
const UNWEIGHTED_STAGE = "00000000-0000-4000-8000-000000000014";

function stageOption(value: string, index: number, weight?: number) {
  return {
    value,
    label: `Stage ${index + 1}`,
    color: "secondary" as const,
    isDefault: index === 0,
    index,
    ...(weight === undefined ? {} : { weight }),
  };
}

function stageColumn(id: string, options: ReturnType<typeof stageOption>[]) {
  return {
    id,
    label: "Stage",
    type: CustomColumnType.singleSelect,
    entityType: EntityType.deal,
    options: { options },
  } as const;
}

const STORED_OPTIONS = [stageOption(QUALIFIED, 0, 20), stageOption(PROPOSAL, 1, 60)];

function makeInteractor({
  canUpdateCompany,
  canUpdateDeals = true,
  columnId = STAGE_COLUMN_ID,
}: {
  canUpdateCompany: boolean;
  canUpdateDeals?: boolean;
  columnId?: string;
}) {
  const stored = stageColumn(columnId, STORED_OPTIONS);
  const repo = {
    findByIdOrThrow: vi.fn().mockResolvedValue(stored),
    upsertCustomColumnOrThrow: vi.fn((data: UpsertCustomColumnData) => Promise.resolve({ ...stored, ...data })),
  };
  const companyRepo = { getDealWeightingColumnId: vi.fn().mockResolvedValue(STAGE_COLUMN_ID) };
  const userService = {
    hasPermissionOrThrow: vi.fn((resource: Resource) =>
      (resource === Resource.company && !canUpdateCompany) || (resource === Resource.deals && !canUpdateDeals)
        ? Promise.reject(new Error("User has insufficient permissions"))
        : Promise.resolve(),
    ),
  };
  const eventService = { publish: vi.fn().mockResolvedValue(undefined) };
  const validator = { invoke: vi.fn().mockResolvedValue(undefined) };

  return {
    interactor: new UpsertCustomColumnInteractor(
      repo as never,
      companyRepo as never,
      userService as never,
      eventService as never,
      validator as never,
    ),
    repo,
    userService,
  };
}

function update(columnId: string, options: ReturnType<typeof stageOption>[]): UpsertCustomColumnData {
  return { ...stageColumn(columnId, options), label: "Stage" };
}

describe("UpsertCustomColumnInteractor deal stage weights", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses a changed weight on the deal weighting column without company update permission", async () => {
    const { interactor, repo, userService } = makeInteractor({ canUpdateCompany: false });

    await expect(
      interactor.invoke(update(STAGE_COLUMN_ID, [stageOption(QUALIFIED, 0, 35), stageOption(PROPOSAL, 1, 60)])),
    ).rejects.toThrow("User has insufficient permissions");

    expect(userService.hasPermissionOrThrow).toHaveBeenCalledWith(Resource.company, Action.update);
    expect(repo.upsertCustomColumnOrThrow).not.toHaveBeenCalled();
  });

  it("refuses dropping a stored weight on the deal weighting column without company update permission", async () => {
    const { interactor, repo } = makeInteractor({ canUpdateCompany: false });

    await expect(
      interactor.invoke(update(STAGE_COLUMN_ID, [stageOption(QUALIFIED, 0), stageOption(PROPOSAL, 1, 60)])),
    ).rejects.toThrow("User has insufficient permissions");

    expect(repo.upsertCustomColumnOrThrow).not.toHaveBeenCalled();
  });

  it("changes the weights with company update permission", async () => {
    const { interactor, repo, userService } = makeInteractor({ canUpdateCompany: true });

    const result = await interactor.invoke(
      update(STAGE_COLUMN_ID, [stageOption(QUALIFIED, 0, 35), stageOption(PROPOSAL, 1, 60)]),
    );

    expect(result.ok).toBe(true);
    expect(userService.hasPermissionOrThrow).toHaveBeenCalledWith(Resource.company, Action.update);
    expect(repo.upsertCustomColumnOrThrow).toHaveBeenCalledTimes(1);
  });

  it("lets a deals manager rename, add and remove stages while the stored weights stay unchanged", async () => {
    const { interactor, repo, userService } = makeInteractor({ canUpdateCompany: false });

    const result = await interactor.invoke(
      update(STAGE_COLUMN_ID, [
        { ...stageOption(PROPOSAL, 0, 60), label: "Offer" },
        stageOption(NEW_STAGE, 1, 0),
        stageOption(UNWEIGHTED_STAGE, 2),
      ]),
    );

    expect(result.ok).toBe(true);
    expect(userService.hasPermissionOrThrow).not.toHaveBeenCalledWith(Resource.company, Action.update);
    expect(repo.upsertCustomColumnOrThrow).toHaveBeenCalledTimes(1);
  });

  it("leaves weights on a column that is not the deal weighting column to the deals permission", async () => {
    const { interactor, repo, userService } = makeInteractor({ canUpdateCompany: false, columnId: OTHER_COLUMN_ID });

    const result = await interactor.invoke(
      update(OTHER_COLUMN_ID, [stageOption(QUALIFIED, 0, 90), stageOption(PROPOSAL, 1, 60)]),
    );

    expect(result.ok).toBe(true);
    expect(userService.hasPermissionOrThrow).toHaveBeenCalledWith(Resource.deals, Action.update);
    expect(userService.hasPermissionOrThrow).not.toHaveBeenCalledWith(Resource.company, Action.update);
    expect(repo.upsertCustomColumnOrThrow).toHaveBeenCalledTimes(1);
  });
});

describe("UpsertCustomColumnInteractor stored column identity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("checks the stored entity type, so a contacts manager cannot move the deal stage column", async () => {
    const { interactor, repo, userService } = makeInteractor({ canUpdateCompany: false, canUpdateDeals: false });

    await expect(
      interactor.invoke({ ...update(STAGE_COLUMN_ID, STORED_OPTIONS), entityType: EntityType.contact }),
    ).rejects.toThrow("User has insufficient permissions");

    expect(userService.hasPermissionOrThrow).toHaveBeenCalledWith(Resource.deals, Action.update);
    expect(userService.hasPermissionOrThrow).not.toHaveBeenCalledWith(Resource.contacts, Action.update);
    expect(repo.upsertCustomColumnOrThrow).not.toHaveBeenCalled();
  });

  it("keeps the stored entity type when an update names another one", async () => {
    const { interactor, repo } = makeInteractor({ canUpdateCompany: true });

    const result = await interactor.invoke({
      ...update(STAGE_COLUMN_ID, STORED_OPTIONS),
      entityType: EntityType.contact,
    });

    expect(result.ok).toBe(true);
    expect(repo.upsertCustomColumnOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ id: STAGE_COLUMN_ID, entityType: EntityType.deal }),
    );
  });

  it("refuses a type change, so a deals manager cannot wipe the stage weights by retyping the column", async () => {
    const { interactor, repo, userService } = makeInteractor({ canUpdateCompany: false });

    const result = await interactor.invoke({
      id: STAGE_COLUMN_ID,
      label: "Stage",
      entityType: EntityType.deal,
      type: CustomColumnType.plain,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected the type change to be refused");
    expect(result.error.issues[0]).toMatchObject({
      path: ["type"],
      params: {
        error: CustomErrorCode.customColumnTypeMismatch,
        kind: "conflict",
        actualType: CustomColumnType.singleSelect,
        expectedType: CustomColumnType.plain,
      },
    });
    expect(userService.hasPermissionOrThrow).not.toHaveBeenCalledWith(Resource.company, Action.update);
    expect(repo.upsertCustomColumnOrThrow).not.toHaveBeenCalled();
  });
});
