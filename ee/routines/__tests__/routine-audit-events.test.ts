import type { TenantUser } from "@/features/user/user.schema";
import type { EventService } from "@/features/event/event.service";
import type { RoutineDto } from "../routine.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { Action, Resource } from "@/generated/prisma";

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
import { DomainEvent } from "@/features/event/domain-events";
import { AUDIT_EVENT_ENTITY_TYPE } from "@/features/event/audit-entity-type";
import { getEntityName } from "@/features/event/entity-name.utils";
import { WEBHOOK_EVENTS } from "@/features/webhook/webhook-event-registry";

const ROUTINE_ID = "00000000-0000-4000-8000-000000000001";
const OWNER_ID = "00000000-0000-4000-8000-000000000002";

function owner(id = OWNER_ID): TenantUser {
  const role = createMockUser().role;
  if (!role) throw new Error("The mock tenant user must have a role");

  return createMockUser({
    id,
    role: {
      ...role,
      id: "member-role",
      name: "Member",
      isSystemRole: false,
      permissions: [Action.create, Action.readAll, Action.update, Action.delete].map((action, index) => ({
        id: `routines-${index}`,
        resource: Resource.routines,
        action,
      })),
    },
  });
}

function routine(overrides: Partial<RoutineDto> = {}): RoutineDto {
  return {
    id: ROUTINE_ID,
    ownerUserId: OWNER_ID,
    owner: {
      id: OWNER_ID,
      firstName: "Routine",
      lastName: "Owner",
      avatarUrl: null,
      status: "active",
    },
    name: "Daily deal digest",
    prompt: "Summarise the open pipeline.",
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

function eventService() {
  const publish = vi.fn().mockResolvedValue(undefined);

  return { publish, service: { publish } as unknown as EventService };
}

describe("routine audit events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = owner();
  });

  it("publishes routine.created when a routine is created", async () => {
    const created = routine();
    const repo = {
      getRoutineByIdOrThrow: vi.fn(),
      upsertRoutineOrThrow: vi.fn().mockResolvedValue(created),
      isEligibleRoutineOwner: vi.fn().mockResolvedValue(true),
    };
    const { publish, service } = eventService();

    const result = await new UpsertRoutineInteractor(
      repo as never,
      { getSubscriptionOrThrow: vi.fn().mockResolvedValue({ plan: "enterprise" }) } as never,
      service,
    ).invoke({
      name: "Daily deal digest",
      prompt: "Summarise the open pipeline.",
      triggerKind: "schedule",
      cronExpression: "0 9 * * *",
    });

    expect(result.ok).toBe(true);
    expect(publish).toHaveBeenCalledExactlyOnceWith(DomainEvent.ROUTINE_CREATED, {
      entityId: ROUTINE_ID,
      payload: created,
    });
  });

  it("publishes routine.updated with the calculated changes when a routine is edited", async () => {
    const previous = routine();
    const current = routine({ name: "Weekly deal digest", cronExpression: "0 9 * * 1" });
    const repo = {
      getRoutineByIdOrThrow: vi.fn().mockResolvedValue(previous),
      upsertRoutineOrThrow: vi.fn().mockResolvedValue(current),
      isEligibleRoutineOwner: vi.fn().mockResolvedValue(true),
    };
    const { publish, service } = eventService();

    const result = await new UpsertRoutineInteractor(
      repo as never,
      { getSubscriptionOrThrow: vi.fn() } as never,
      service,
    ).invoke({ id: ROUTINE_ID, name: "Weekly deal digest", cronExpression: "0 9 * * 1" });

    expect(result.ok).toBe(true);
    expect(publish).toHaveBeenCalledExactlyOnceWith(DomainEvent.ROUTINE_UPDATED, {
      entityId: ROUTINE_ID,
      payload: {
        routine: current,
        changes: {
          name: { previous: "Daily deal digest", current: "Weekly deal digest" },
          cronExpression: { previous: "0 9 * * *", current: "0 9 * * 1" },
        },
      },
    });
  });

  it("carries the prompt change, so an edited instruction is recoverable from the audit row", async () => {
    const previous = routine();
    const current = routine({ prompt: "Summarise the open pipeline and email the owner." });
    const repo = {
      getRoutineByIdOrThrow: vi.fn().mockResolvedValue(previous),
      upsertRoutineOrThrow: vi.fn().mockResolvedValue(current),
      isEligibleRoutineOwner: vi.fn().mockResolvedValue(true),
    };
    const { publish, service } = eventService();

    await new UpsertRoutineInteractor(repo as never, { getSubscriptionOrThrow: vi.fn() } as never, service).invoke({
      id: ROUTINE_ID,
      prompt: "Summarise the open pipeline and email the owner.",
    });

    const [, data] = publish.mock.calls[0];

    expect((data as { payload: { changes: Record<string, unknown> } }).payload.changes).toEqual({
      prompt: {
        previous: "Summarise the open pipeline.",
        current: "Summarise the open pipeline and email the owner.",
      },
    });
  });

  it("publishes an empty change set for an edit that changes nothing, which the event service then discards", async () => {
    const unchanged = routine();
    const repo = {
      getRoutineByIdOrThrow: vi.fn().mockResolvedValue(unchanged),
      upsertRoutineOrThrow: vi.fn().mockResolvedValue(routine()),
      isEligibleRoutineOwner: vi.fn().mockResolvedValue(true),
    };
    const { publish, service } = eventService();

    await new UpsertRoutineInteractor(repo as never, { getSubscriptionOrThrow: vi.fn() } as never, service).invoke({
      id: ROUTINE_ID,
      name: "Daily deal digest",
    });

    const [, data] = publish.mock.calls[0];

    expect((data as { payload: { changes: Record<string, unknown> } }).payload.changes).toEqual({});
  });

  it("publishes routine.deleted with the deleted routine", async () => {
    currentUser = createMockUser({ id: "admin-user" });
    const deleted = routine();
    const repo = {
      isActiveSystemAdministrator: vi.fn().mockResolvedValue(true),
      deleteRoutineOrThrow: vi.fn().mockResolvedValue(deleted),
    };
    const { publish, service } = eventService();

    const result = await new DeleteRoutineInteractor(repo as never, service).invoke({ id: ROUTINE_ID });

    expect(result.ok).toBe(true);
    expect(publish).toHaveBeenCalledExactlyOnceWith(DomainEvent.ROUTINE_DELETED, {
      entityId: ROUTINE_ID,
      payload: deleted,
    });
  });

  it("publishes nothing when a delete is refused because a run is still in flight", async () => {
    currentUser = createMockUser({ id: "admin-user" });
    const repo = {
      isActiveSystemAdministrator: vi.fn().mockResolvedValue(true),
      deleteRoutineOrThrow: vi.fn().mockResolvedValue(null),
    };
    const { publish, service } = eventService();

    const result = await new DeleteRoutineInteractor(repo as never, service).invoke({ id: ROUTINE_ID });

    expect(result.ok).toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });

  it("publishes routine.updated when an administrator pauses a routine", async () => {
    currentUser = createMockUser({ id: "admin-user" });
    const previous = routine();
    const paused = routine({ enabled: false, disabledReason: "adminPaused" });
    const repo = {
      isActiveSystemAdministrator: vi.fn().mockResolvedValue(true),
      getRoutineByIdOrThrow: vi.fn().mockResolvedValue(previous),
      pauseRoutineOrThrow: vi.fn().mockResolvedValue(paused),
    };
    const { publish, service } = eventService();

    const result = await new PauseRoutineInteractor(repo as never, service).invoke({ routineId: ROUTINE_ID });

    expect(result).toEqual({ ok: true, data: paused });
    expect(publish).toHaveBeenCalledExactlyOnceWith(DomainEvent.ROUTINE_UPDATED, {
      entityId: ROUTINE_ID,
      payload: {
        routine: paused,
        changes: {
          enabled: { previous: true, current: false },
          disabledReason: { previous: null, current: "adminPaused" },
        },
      },
    });
  });

  it("publishes nothing when a pause is refused for a caller who is not an administrator", async () => {
    currentUser = owner();
    const repo = {
      isActiveSystemAdministrator: vi.fn().mockResolvedValue(false),
      getRoutineByIdOrThrow: vi.fn(),
      pauseRoutineOrThrow: vi.fn(),
    };
    const { publish, service } = eventService();

    const result = await new PauseRoutineInteractor(repo as never, service).invoke({ routineId: ROUTINE_ID });

    expect(result.ok).toBe(false);
    expect(publish).not.toHaveBeenCalled();
    expect(repo.pauseRoutineOrThrow).not.toHaveBeenCalled();
  });

  it("publishes nothing when a non-owner edit is rejected", async () => {
    currentUser = owner("00000000-0000-4000-8000-000000000099");
    const repo = {
      getRoutineByIdOrThrow: vi.fn().mockResolvedValue(routine()),
      upsertRoutineOrThrow: vi.fn(),
      isEligibleRoutineOwner: vi.fn().mockResolvedValue(true),
    };
    const { publish, service } = eventService();

    const result = await new UpsertRoutineInteractor(
      repo as never,
      { getSubscriptionOrThrow: vi.fn() } as never,
      service,
    ).invoke({ id: ROUTINE_ID, name: "Not mine" });

    expect(result.ok).toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });
});

describe("routine audit event wiring", () => {
  it("classifies every routine event as unlinked to a record entity type", () => {
    expect(AUDIT_EVENT_ENTITY_TYPE[DomainEvent.ROUTINE_CREATED]).toBeNull();
    expect(AUDIT_EVENT_ENTITY_TYPE[DomainEvent.ROUTINE_UPDATED]).toBeNull();
    expect(AUDIT_EVENT_ENTITY_TYPE[DomainEvent.ROUTINE_DELETED]).toBeNull();
  });

  it("names the routine in the audit row for each event", () => {
    const current = routine();

    expect(
      getEntityName(DomainEvent.ROUTINE_CREATED, {
        userId: OWNER_ID,
        companyId: "company",
        entityId: ROUTINE_ID,
        payload: current,
      }),
    ).toBe("Daily deal digest");

    expect(
      getEntityName(DomainEvent.ROUTINE_UPDATED, {
        userId: OWNER_ID,
        companyId: "company",
        entityId: ROUTINE_ID,
        payload: { routine: current, changes: {} },
      }),
    ).toBe("Daily deal digest");

    expect(
      getEntityName(DomainEvent.ROUTINE_DELETED, {
        userId: OWNER_ID,
        companyId: "company",
        entityId: ROUTINE_ID,
        payload: current,
      }),
    ).toBe("Daily deal digest");
  });

  it("keeps routine events out of the webhook catalog, so a routine edit cannot trigger a routine", () => {
    const routineEvents: string[] = [
      DomainEvent.ROUTINE_CREATED,
      DomainEvent.ROUTINE_UPDATED,
      DomainEvent.ROUTINE_DELETED,
    ];

    for (const event of routineEvents) expect(WEBHOOK_EVENTS).not.toContain(event);
  });
});
