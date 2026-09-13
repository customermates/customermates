import { beforeEach, describe, expect, it, vi } from "vitest";

import { CountryCode, Status, SubscriptionPlan } from "@/generated/prisma";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const sessionUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => sessionUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { AdminUpdateUserDetailsInteractor } from "../upsert/admin-update-user-details.interactor";

vi.mock("next-intl/server", () => ({
  getTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
}));

const TARGET_USER_ID = "00000000-0000-4000-8000-000000000010";
const TARGET_ROLE_ID = "00000000-0000-4000-8000-000000000011";
const TARGET_EMAIL = "teammate@example.com";

function harness(previousStatus: Status) {
  const userRepo = {
    findExistingEmailsCompanyWide: vi.fn().mockResolvedValue(new Set([TARGET_EMAIL])),
    isPlatformOperatorCompanyWide: vi.fn().mockResolvedValue(false),
    findOrThrowCompanyWide: vi.fn().mockResolvedValue(
      createMockUser({
        id: TARGET_USER_ID,
        email: TARGET_EMAIL,
        status: previousStatus,
      }),
    ),
    adminUpdateDetailsOrThrow: vi.fn().mockResolvedValue(undefined),
    markAgentCreditActivatedOrThrow: vi.fn().mockResolvedValue(undefined),
    clearAgentCreditActivatedOrThrow: vi.fn().mockResolvedValue(undefined),
  };
  const roleRepo = {
    isSystemRoleOrThrow: vi.fn().mockResolvedValue(false),
    hasAnotherActiveSystemRoleUser: vi.fn(),
  };
  const eventService = { publish: vi.fn().mockResolvedValue(undefined) };
  const subscriptionService = { updateSubscriptionQuantityOrThrow: vi.fn() };
  const subscriptionRepo = {
    getSubscriptionOrThrow: vi.fn().mockResolvedValue({ plan: SubscriptionPlan.enterprise }),
  };
  const countUsersRepo = { countActiveUsers: vi.fn() };
  const releaseOwnerRoutines = { invoke: vi.fn().mockResolvedValue({ blocked: 0, disabled: 0 }) };
  const ownerRoutinesRepo = { getRoutinesForOwner: vi.fn().mockResolvedValue([]) };

  const interactor = new AdminUpdateUserDetailsInteractor(
    userRepo as never,
    roleRepo as never,
    eventService as never,
    subscriptionService as never,
    subscriptionRepo as never,
    countUsersRepo as never,
    releaseOwnerRoutines as never,
    ownerRoutinesRepo as never,
  );

  const invoke = (status: "active" | "inactive") =>
    interactor.invoke({
      email: TARGET_EMAIL,
      firstName: "Team",
      lastName: "Mate",
      country: CountryCode.de,
      status,
      avatarUrl: null,
      roleId: TARGET_ROLE_ID,
    });

  return { invoke, subscriptionRepo, userRepo, eventService, ownerRoutinesRepo, releaseOwnerRoutines };
}

function expectProfileUpdateBefore(profileUpdate: ReturnType<typeof vi.fn>, timestampWrite: ReturnType<typeof vi.fn>) {
  expect(profileUpdate.mock.invocationCallOrder[0]).toBeLessThan(timestampWrite.mock.invocationCallOrder[0]);
}

function routine(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    ownerUserId: TARGET_USER_ID,
    owner: null,
    name: `Routine ${id}`,
    prompt: "Summarise the pipeline.",
    enabled: true,
    triggerKind: "schedule",
    cronExpression: "0 9 * * *",
    timezone: "Europe/Berlin",
    triggerEvents: [],
    changedFields: [],
    triggerFilters: [],
    debounceSeconds: 300,
    nextRunAt: null,
    lastRunAt: null,
    lastRunStatus: null,
    disabledReason: null,
    createdAt: new Date("2026-09-01T08:00:00.000Z"),
    updatedAt: new Date("2026-09-01T08:00:00.000Z"),
    ...overrides,
  };
}

describe("AdminUpdateUserDetailsInteractor routine release audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("audits every routine the deactivation disabled", async () => {
    const { invoke, eventService, ownerRoutinesRepo } = harness(Status.active);
    const disabled = { enabled: false, disabledReason: "ownerUnavailable" };

    ownerRoutinesRepo.getRoutinesForOwner
      .mockResolvedValueOnce([routine("a"), routine("b")])
      .mockResolvedValueOnce([routine("a", disabled), routine("b", disabled)]);

    await expect(invoke(Status.inactive)).resolves.toMatchObject({ ok: true });

    const routineEvents = eventService.publish.mock.calls.filter(([event]) => event === "routine.updated");

    expect(routineEvents).toHaveLength(2);
    expect(routineEvents.map(([, data]) => data.entityId).sort()).toEqual(["a", "b"]);
    expect(routineEvents[0][1].payload.changes).toEqual({
      enabled: { previous: true, current: false },
      disabledReason: { previous: null, current: "ownerUnavailable" },
    });
  });

  it("reads the routines before the release runs, so the previous state is not already disabled", async () => {
    const { invoke, ownerRoutinesRepo, releaseOwnerRoutines } = harness(Status.active);

    ownerRoutinesRepo.getRoutinesForOwner.mockResolvedValue([]);

    await invoke(Status.inactive);

    expect(ownerRoutinesRepo.getRoutinesForOwner.mock.invocationCallOrder[0]).toBeLessThan(
      releaseOwnerRoutines.invoke.mock.invocationCallOrder[0],
    );
    expect(releaseOwnerRoutines.invoke.mock.invocationCallOrder[0]).toBeLessThan(
      ownerRoutinesRepo.getRoutinesForOwner.mock.invocationCallOrder[1],
    );
  });

  it("publishes no routine event for a routine the release left untouched", async () => {
    const { invoke, eventService, ownerRoutinesRepo } = harness(Status.active);

    ownerRoutinesRepo.getRoutinesForOwner.mockResolvedValue([routine("a", { enabled: false })]);

    await invoke(Status.inactive);

    expect(eventService.publish.mock.calls.filter(([event]) => event === "routine.updated")).toHaveLength(0);
  });

  it("publishes nothing about routines when the user stays active", async () => {
    const { invoke, eventService, ownerRoutinesRepo } = harness(Status.active);

    await invoke(Status.active);

    expect(ownerRoutinesRepo.getRoutinesForOwner).not.toHaveBeenCalled();
    expect(eventService.publish.mock.calls.filter(([event]) => event === "routine.updated")).toHaveLength(0);
  });
});

describe("AdminUpdateUserDetailsInteractor agent credit activation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks agent credit activation after a pending user becomes active", async () => {
    const { invoke, userRepo } = harness(Status.pendingAuthorization);

    await expect(invoke(Status.active)).resolves.toMatchObject({ ok: true });

    expect(userRepo.markAgentCreditActivatedOrThrow).toHaveBeenCalledWith(TARGET_USER_ID);
    expect(userRepo.clearAgentCreditActivatedOrThrow).not.toHaveBeenCalled();
    expectProfileUpdateBefore(userRepo.adminUpdateDetailsOrThrow, userRepo.markAgentCreditActivatedOrThrow);
  });

  it("marks agent credit activation after an inactive user becomes active", async () => {
    const { invoke, userRepo } = harness(Status.inactive);

    await expect(invoke(Status.active)).resolves.toMatchObject({ ok: true });

    expect(userRepo.markAgentCreditActivatedOrThrow).toHaveBeenCalledWith(TARGET_USER_ID);
    expect(userRepo.clearAgentCreditActivatedOrThrow).not.toHaveBeenCalled();
    expectProfileUpdateBefore(userRepo.adminUpdateDetailsOrThrow, userRepo.markAgentCreditActivatedOrThrow);
  });

  it("does not change the activation timestamp when an active user stays active", async () => {
    const { invoke, subscriptionRepo, userRepo } = harness(Status.active);

    await expect(invoke(Status.active)).resolves.toMatchObject({ ok: true });

    expect(userRepo.adminUpdateDetailsOrThrow).toHaveBeenCalledOnce();
    expect(userRepo.markAgentCreditActivatedOrThrow).not.toHaveBeenCalled();
    expect(userRepo.clearAgentCreditActivatedOrThrow).not.toHaveBeenCalled();
    expect(subscriptionRepo.getSubscriptionOrThrow).not.toHaveBeenCalled();
  });

  it("clears agent credit activation after an active user becomes inactive", async () => {
    const { invoke, userRepo } = harness(Status.active);

    await expect(invoke(Status.inactive)).resolves.toMatchObject({ ok: true });

    expect(userRepo.clearAgentCreditActivatedOrThrow).toHaveBeenCalledWith(TARGET_USER_ID);
    expect(userRepo.markAgentCreditActivatedOrThrow).not.toHaveBeenCalled();
    expectProfileUpdateBefore(userRepo.adminUpdateDetailsOrThrow, userRepo.clearAgentCreditActivatedOrThrow);
  });

  it("refuses a tenant-side status change on a platform operator account", async () => {
    const { userRepo, invoke } = harness(Status.active);
    userRepo.isPlatformOperatorCompanyWide.mockResolvedValue(true);

    const result = await invoke("inactive");

    expect(result.ok).toBe(false);
    expect(userRepo.adminUpdateDetailsOrThrow).not.toHaveBeenCalled();
    expect(userRepo.clearAgentCreditActivatedOrThrow).not.toHaveBeenCalled();
  });

  it("still allows reactivating a platform operator, so a cron deactivation stays recoverable", async () => {
    const { userRepo, invoke } = harness(Status.inactive);
    userRepo.isPlatformOperatorCompanyWide.mockResolvedValue(true);

    const result = await invoke("active");

    expect(result.ok).toBe(true);
    expect(userRepo.adminUpdateDetailsOrThrow).toHaveBeenCalled();
  });

  it("still allows a tenant-side status change on an ordinary account", async () => {
    const { userRepo, invoke } = harness(Status.active);
    userRepo.isPlatformOperatorCompanyWide.mockResolvedValue(false);

    const result = await invoke("inactive");

    expect(result.ok).toBe(true);
    expect(userRepo.adminUpdateDetailsOrThrow).toHaveBeenCalled();
  });
});
