import type { TenantUser } from "@/features/user/user.schema";
import type { RoutineDto } from "../routine.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

let currentUser: TenantUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => currentUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
  getLocale: () => Promise.resolve("en"),
}));

import { DeleteRoutineInteractor } from "../delete-routine.interactor";
import { PauseRoutineInteractor } from "../pause-routine.interactor";
import { UpsertRoutineInteractor } from "../upsert-routine.interactor";
import { CustomErrorCode } from "@/core/validation/validation.types";

const ROUTINE_ID = "00000000-0000-4000-8000-000000000001";
const OWNER_ID = "00000000-0000-4000-8000-000000000002";

function member(id = OWNER_ID): TenantUser {
  const role = createMockUser().role;
  if (!role) throw new Error("The mock tenant user must have a role");

  return createMockUser({
    id,
    role: {
      ...role,
      id: "member-role",
      name: "Member",
      isSystemRole: false,
      permissions: [],
    },
  });
}

function routine(ownerUserId = OWNER_ID): RoutineDto {
  return {
    id: ROUTINE_ID,
    ownerUserId,
    owner: {
      id: ownerUserId,
      firstName: "Routine",
      lastName: "Owner",
      avatarUrl: null,
      status: "active",
    },
    name: "Daily deal digest",
    prompt: "Summarise the open pipeline.",
    modelKey: null,
    enabled: true,
    triggerKind: "schedule",
    cronExpression: "0 9 * * *",
    timezone: "Europe/Berlin",
    runOnceAt: null,
    triggerEvents: [],
    changedFields: [],
    triggerFilters: [],
    debounceSeconds: 300,
    maxRunsPerHour: 4,
    maxCreditsPerRun: 10,
    nextRunAt: new Date(),
    lastRunAt: null,
    lastRunStatus: null,
    disabledReason: null,
    suppressedEventCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function expectAuthorizationFailure(
  result: Awaited<ReturnType<UpsertRoutineInteractor["invoke"]>>,
  code: CustomErrorCode,
) {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Expected authorization failure");
  expect(result.error.issues[0]).toMatchObject({
    params: { error: code, kind: "authorization" },
  });
}

describe("routine ownership writes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = member();
  });

  it("lets an active company member create a routine they will own", async () => {
    const repo = {
      getRoutineByIdOrThrow: vi.fn(),
      upsertRoutineOrThrow: vi.fn().mockResolvedValue(routine()),
      isEligibleRoutineOwner: vi.fn().mockResolvedValue(true),
      countRoutines: vi.fn().mockResolvedValue(0),
    };
    const subscriptions = {
      getSubscriptionOrThrow: vi.fn().mockResolvedValue({ plan: "enterprise" }),
    };
    const background = { dispatch: vi.fn() };

    const result = await new UpsertRoutineInteractor(repo as never, subscriptions as never, background as never).invoke(
      {
        name: "Daily deal digest",
        prompt: "Summarise the open pipeline.",
        triggerKind: "schedule",
        cronExpression: "0 9 * * *",
      },
    );

    expect(result.ok).toBe(true);
    expect(repo.upsertRoutineOrThrow).toHaveBeenCalledOnce();
  });

  it("lets the owner edit their routine", async () => {
    const repo = {
      getRoutineByIdOrThrow: vi.fn().mockResolvedValue(routine()),
      upsertRoutineOrThrow: vi.fn().mockResolvedValue(routine()),
      isEligibleRoutineOwner: vi.fn().mockResolvedValue(true),
      countRoutines: vi.fn(),
    };

    const result = await new UpsertRoutineInteractor(
      repo as never,
      { getSubscriptionOrThrow: vi.fn() } as never,
      { dispatch: vi.fn() } as never,
    ).invoke({ id: ROUTINE_ID, name: "Renamed" });

    expect(result.ok).toBe(true);
    expect(repo.upsertRoutineOrThrow).toHaveBeenCalledOnce();
  });

  it("lets the owner pause their routine through the owner-only edit path", async () => {
    const paused = routine();
    paused.enabled = false;
    paused.disabledReason = "ownerPaused";
    const repo = {
      getRoutineByIdOrThrow: vi.fn().mockResolvedValue(routine()),
      upsertRoutineOrThrow: vi.fn().mockResolvedValue(paused),
      isEligibleRoutineOwner: vi.fn().mockResolvedValue(true),
      countRoutines: vi.fn(),
    };

    const result = await new UpsertRoutineInteractor(
      repo as never,
      { getSubscriptionOrThrow: vi.fn() } as never,
      { dispatch: vi.fn() } as never,
    ).invoke({ id: ROUTINE_ID, enabled: false });

    expect(result).toEqual({ ok: true, data: paused });
    expect(repo.upsertRoutineOrThrow).toHaveBeenCalledWith({ id: ROUTINE_ID, enabled: false }, undefined);
  });

  it("rejects a non-owner edit even when the caller is a company admin", async () => {
    currentUser = createMockUser({ id: "admin-user" });
    const repo = {
      getRoutineByIdOrThrow: vi.fn().mockResolvedValue(routine()),
      upsertRoutineOrThrow: vi.fn(),
      isEligibleRoutineOwner: vi.fn().mockResolvedValue(true),
      countRoutines: vi.fn(),
    };

    const result = await new UpsertRoutineInteractor(
      repo as never,
      { getSubscriptionOrThrow: vi.fn() } as never,
      { dispatch: vi.fn() } as never,
    ).invoke({ id: ROUTINE_ID, enabled: true });

    expectAuthorizationFailure(result, CustomErrorCode.routineEditNotOwner);
    expect(repo.upsertRoutineOrThrow).not.toHaveBeenCalled();
  });

  it("rejects a non-owner edit from an ordinary company member", async () => {
    currentUser = member("other-member");
    const repo = {
      getRoutineByIdOrThrow: vi.fn().mockResolvedValue(routine()),
      upsertRoutineOrThrow: vi.fn(),
      isEligibleRoutineOwner: vi.fn().mockResolvedValue(true),
      countRoutines: vi.fn(),
    };

    const result = await new UpsertRoutineInteractor(
      repo as never,
      { getSubscriptionOrThrow: vi.fn() } as never,
      { dispatch: vi.fn() } as never,
    ).invoke({ id: ROUTINE_ID, name: "Not mine" });

    expectAuthorizationFailure(result, CustomErrorCode.routineEditNotOwner);
    expect(repo.upsertRoutineOrThrow).not.toHaveBeenCalled();
  });

  it("rejects a stale session after its owner has become inactive", async () => {
    const repo = {
      getRoutineByIdOrThrow: vi.fn(),
      upsertRoutineOrThrow: vi.fn(),
      isEligibleRoutineOwner: vi.fn().mockResolvedValue(false),
      countRoutines: vi.fn(),
    };

    const result = await new UpsertRoutineInteractor(
      repo as never,
      { getSubscriptionOrThrow: vi.fn() } as never,
      { dispatch: vi.fn() } as never,
    ).invoke({ id: ROUTINE_ID, enabled: true });

    expectAuthorizationFailure(result, CustomErrorCode.routineOwnerIneligible);
    expect(repo.getRoutineByIdOrThrow).not.toHaveBeenCalled();
    expect(repo.upsertRoutineOrThrow).not.toHaveBeenCalled();
  });
});

describe("routine administration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = createMockUser({ id: "admin-user" });
  });

  it("lets an admin pause another owner's routine", async () => {
    const repo = {
      isActiveSystemAdministrator: vi.fn().mockResolvedValue(true),
      pauseRoutineOrThrow: vi.fn().mockResolvedValue(routine()),
    };

    const result = await new PauseRoutineInteractor(repo as never).invoke({
      routineId: ROUTINE_ID,
    });

    expect(result.ok).toBe(true);
    expect(repo.isActiveSystemAdministrator).toHaveBeenCalledWith("admin-user");
    expect(repo.pauseRoutineOrThrow).toHaveBeenCalledWith(ROUTINE_ID, expect.any(Date));
  });

  it("rejects a non-admin pause", async () => {
    currentUser = member("other-member");
    const repo = {
      isActiveSystemAdministrator: vi.fn(),
      pauseRoutineOrThrow: vi.fn(),
    };

    const result = await new PauseRoutineInteractor(repo as never).invoke({
      routineId: ROUTINE_ID,
    });

    expectAuthorizationFailure(result as never, CustomErrorCode.routineAdminRequired);
    expect(repo.isActiveSystemAdministrator).not.toHaveBeenCalled();
    expect(repo.pauseRoutineOrThrow).not.toHaveBeenCalled();
  });

  it("rejects an admin pause when the live membership or role no longer authorizes it", async () => {
    const repo = {
      isActiveSystemAdministrator: vi.fn().mockResolvedValue(false),
      pauseRoutineOrThrow: vi.fn(),
    };

    const result = await new PauseRoutineInteractor(repo as never).invoke({
      routineId: ROUTINE_ID,
    });

    expectAuthorizationFailure(result as never, CustomErrorCode.routineAdminRequired);
    expect(repo.isActiveSystemAdministrator).toHaveBeenCalledWith("admin-user");
    expect(repo.pauseRoutineOrThrow).not.toHaveBeenCalled();
  });

  it("allows an admin, but not an ordinary owner or member, to delete a routine", async () => {
    const repo = {
      isActiveSystemAdministrator: vi.fn().mockResolvedValue(true),
      deleteRoutineOrThrow: vi.fn().mockResolvedValue(routine()),
    };
    await expect(new DeleteRoutineInteractor(repo as never).invoke({ id: ROUTINE_ID })).resolves.toEqual({
      ok: true,
      data: ROUTINE_ID,
    });

    currentUser = member();
    const ownerDenied = await new DeleteRoutineInteractor(repo as never).invoke({ id: ROUTINE_ID });
    expectAuthorizationFailure(ownerDenied as never, CustomErrorCode.routineAdminRequired);

    currentUser = member("other-member");
    const memberDenied = await new DeleteRoutineInteractor(repo as never).invoke({ id: ROUTINE_ID });

    expectAuthorizationFailure(memberDenied as never, CustomErrorCode.routineAdminRequired);
    expect(repo.isActiveSystemAdministrator).toHaveBeenCalledTimes(1);
    expect(repo.isActiveSystemAdministrator).toHaveBeenCalledWith("admin-user");
    expect(repo.deleteRoutineOrThrow).toHaveBeenCalledTimes(1);
  });

  it("rejects an admin delete when the live membership or role no longer authorizes it", async () => {
    const repo = {
      isActiveSystemAdministrator: vi.fn().mockResolvedValue(false),
      deleteRoutineOrThrow: vi.fn(),
    };

    const result = await new DeleteRoutineInteractor(repo as never).invoke({
      id: ROUTINE_ID,
    });

    expectAuthorizationFailure(result as never, CustomErrorCode.routineAdminRequired);
    expect(repo.isActiveSystemAdministrator).toHaveBeenCalledWith("admin-user");
    expect(repo.deleteRoutineOrThrow).not.toHaveBeenCalled();
  });

  it("keeps a routine while one of its paid runs is still active", async () => {
    const repo = {
      isActiveSystemAdministrator: vi.fn().mockResolvedValue(true),
      deleteRoutineOrThrow: vi.fn().mockResolvedValue(null),
    };

    const result = await new DeleteRoutineInteractor(repo as never).invoke({
      id: ROUTINE_ID,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected deletion to be rejected");
    expect(result.error.issues[0]).toMatchObject({
      params: {
        error: CustomErrorCode.routineDeleteHasRunningRun,
        kind: "conflict",
      },
    });
    expect(repo.isActiveSystemAdministrator).toHaveBeenCalledWith("admin-user");
    expect(repo.deleteRoutineOrThrow).toHaveBeenCalledOnce();
    expect(repo.deleteRoutineOrThrow).toHaveBeenCalledWith(ROUTINE_ID);
  });
});
