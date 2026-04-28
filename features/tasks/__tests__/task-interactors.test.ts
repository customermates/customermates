import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/constants/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { CreateTaskInteractor } from "../upsert/create-task.interactor";
import { UpdateTaskInteractor } from "../upsert/update-task.interactor";
import { DeleteTaskInteractor } from "../delete/delete-task.interactor";
import { CreateManyTasksInteractor } from "../upsert/create-many-tasks.interactor";
import { UpdateManyTasksInteractor } from "../upsert/update-many-tasks.interactor";
import { DeleteManyTasksInteractor } from "../delete/delete-many-tasks.interactor";
import { DomainEvent } from "@/features/event/domain-events";

const TASK_ID = "00000000-0000-4000-8000-000000000001";
const TASK_ID_2 = "00000000-0000-4000-8000-000000000002";

function makeTaskDto(overrides: Record<string, unknown> = {}) {
  return {
    id: TASK_ID,
    name: "Test Task",
    type: "custom",
    notes: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    users: [],
    contacts: [],
    organizations: [],
    deals: [],
    services: [],
    customFieldValues: [],
    ...overrides,
  };
}

describe("CreateTaskInteractor", () => {
  let mockCreateRepo: any;
  let mockContactRepo: any;
  let mockOrgRepo: any;
  let mockDealRepo: any;
  let mockServiceRepo: any;
  let mockEventService: any;
  let mockWidgetService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCreateRepo = {
      createTaskOrThrow: vi.fn().mockResolvedValue(makeTaskDto()),
    };
    mockContactRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockOrgRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockDealRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockServiceRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockEventService = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
    mockWidgetService = {
      recalculateUserWidgets: vi.fn().mockResolvedValue(undefined),
    };
  });

  function createInteractor() {
    return new CreateTaskInteractor(
      mockCreateRepo,
      mockContactRepo,
      mockOrgRepo,
      mockDealRepo,
      mockServiceRepo,
      mockEventService,
      mockWidgetService,
    );
  }

  it("publishes TASK_CREATED event with correct entityId and payload", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      name: "Test Task",
      userIds: [],
      contactIds: [],
      organizationIds: [],
      dealIds: [],
      serviceIds: [],
      customFieldValues: [],
    });

    expect(mockEventService.publish).toHaveBeenCalledWith(
      DomainEvent.TASK_CREATED,
      expect.objectContaining({
        entityId: TASK_ID,
        payload: expect.objectContaining({ id: TASK_ID, name: "Test Task" }),
      }),
    );
  });

  it("calls widgetService.recalculateUserWidgets after creation", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      name: "Test Task",
      userIds: [],
      contactIds: [],
      organizationIds: [],
      dealIds: [],
      serviceIds: [],
      customFieldValues: [],
    });

    expect(mockWidgetService.recalculateUserWidgets).toHaveBeenCalledTimes(1);
  });

  it("returns { ok: true, data: task } with the created task", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({
      name: "Test Task",
      userIds: [],
      contactIds: [],
      organizationIds: [],
      dealIds: [],
      serviceIds: [],
      customFieldValues: [],
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        id: TASK_ID,
        name: "Test Task",
      }),
    );
  });
});

describe("UpdateTaskInteractor", () => {
  let mockUpdateRepo: any;
  let mockContactRepo: any;
  let mockOrgRepo: any;
  let mockDealRepo: any;
  let mockServiceRepo: any;
  let mockEventService: any;
  let mockWidgetService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockUpdateRepo = {
      getOrThrowUnscoped: vi.fn().mockResolvedValue(makeTaskDto()),
      getManyOrThrowUnscoped: vi.fn().mockResolvedValue([makeTaskDto()]),
      updateTaskOrThrow: vi.fn().mockResolvedValue(makeTaskDto()),
    };
    mockContactRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockOrgRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockDealRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockServiceRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockEventService = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
    mockWidgetService = {
      recalculateUserWidgets: vi.fn().mockResolvedValue(undefined),
    };
  });

  function createInteractor() {
    return new UpdateTaskInteractor(
      mockUpdateRepo,
      mockContactRepo,
      mockOrgRepo,
      mockDealRepo,
      mockServiceRepo,
      mockEventService,
      mockWidgetService,
    );
  }

  it("publishes TASK_UPDATED event with entityId and changes", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      id: TASK_ID,
      name: "Updated Task",
    });

    expect(mockEventService.publish).toHaveBeenCalledWith(
      DomainEvent.TASK_UPDATED,
      expect.objectContaining({
        entityId: TASK_ID,
        payload: expect.objectContaining({
          task: expect.objectContaining({ id: TASK_ID }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("calls widgetService.recalculateUserWidgets after update", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      id: TASK_ID,
      name: "Updated Task",
    });

    expect(mockWidgetService.recalculateUserWidgets).toHaveBeenCalledTimes(1);
  });

  it("returns { ok: true, data: task } with the updated task", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({
      id: TASK_ID,
      name: "Updated Task",
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        id: TASK_ID,
        name: "Test Task",
      }),
    );
  });
});

describe("DeleteTaskInteractor", () => {
  let mockDeleteRepo: any;
  let mockContactRepo: any;
  let mockOrgRepo: any;
  let mockDealRepo: any;
  let mockServiceRepo: any;
  let mockEventService: any;
  let mockWidgetService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDeleteRepo = {
      getOrThrowUnscoped: vi.fn().mockResolvedValue(makeTaskDto()),
      deleteTaskOrThrow: vi.fn().mockResolvedValue(makeTaskDto()),
    };
    mockContactRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockOrgRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockDealRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockServiceRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockEventService = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
    mockWidgetService = {
      recalculateUserWidgets: vi.fn().mockResolvedValue(undefined),
    };
  });

  function createInteractor() {
    return new DeleteTaskInteractor(
      mockDeleteRepo,
      mockContactRepo,
      mockOrgRepo,
      mockDealRepo,
      mockServiceRepo,
      mockEventService,
      mockWidgetService,
    );
  }

  it("publishes TASK_DELETED event with correct entityId and payload", async () => {
    const interactor = createInteractor();
    await interactor.invoke({ id: TASK_ID });

    expect(mockEventService.publish).toHaveBeenCalledWith(
      DomainEvent.TASK_DELETED,
      expect.objectContaining({
        entityId: TASK_ID,
        payload: expect.objectContaining({ id: TASK_ID }),
      }),
    );
  });

  it("calls widgetService.recalculateUserWidgets after deletion", async () => {
    const interactor = createInteractor();
    await interactor.invoke({ id: TASK_ID });

    expect(mockWidgetService.recalculateUserWidgets).toHaveBeenCalledTimes(1);
  });

  it("returns { ok: true, data: id } with the deleted task id", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({ id: TASK_ID });

    expect(result.ok).toBe(true);
    expect(result.data).toBe(TASK_ID);
  });
});

describe("CreateManyTasksInteractor", () => {
  let mockCreateRepo: any;
  let mockContactRepo: any;
  let mockOrgRepo: any;
  let mockDealRepo: any;
  let mockServiceRepo: any;
  let mockEventService: any;
  let mockWidgetService: any;

  const mockTask1 = makeTaskDto();
  const mockTask2 = makeTaskDto({ id: TASK_ID_2, name: "Task Two" });

  beforeEach(() => {
    vi.clearAllMocks();

    mockCreateRepo = {
      createTaskOrThrow: vi.fn().mockResolvedValueOnce(mockTask1).mockResolvedValueOnce(mockTask2),
    };
    mockContactRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockOrgRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockDealRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockServiceRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockEventService = { publish: vi.fn().mockResolvedValue(undefined) };
    mockWidgetService = { recalculateUserWidgets: vi.fn().mockResolvedValue(undefined) };
  });

  function createInteractor() {
    return new CreateManyTasksInteractor(
      mockCreateRepo,
      mockContactRepo,
      mockOrgRepo,
      mockDealRepo,
      mockServiceRepo,
      mockEventService,
      mockWidgetService,
    );
  }

  it("publishes TASK_CREATED events for each item created", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      tasks: [
        {
          name: "Task One",
          userIds: [],
          contactIds: [],
          organizationIds: [],
          dealIds: [],
          serviceIds: [],
          customFieldValues: [],
        },
        {
          name: "Task Two",
          userIds: [],
          contactIds: [],
          organizationIds: [],
          dealIds: [],
          serviceIds: [],
          customFieldValues: [],
        },
      ],
    });

    const createdCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.TASK_CREATED,
    );
    expect(createdCalls).toHaveLength(2);
    expect(createdCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: TASK_ID,
        payload: expect.objectContaining({ id: TASK_ID, name: "Test Task" }),
      }),
    );
    expect(createdCalls[1][1]).toEqual(
      expect.objectContaining({
        entityId: TASK_ID_2,
        payload: expect.objectContaining({ id: TASK_ID_2, name: "Task Two" }),
      }),
    );
  });

  it("calls widgetService.recalculateUserWidgets", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      tasks: [
        {
          name: "Task One",
          userIds: [],
          contactIds: [],
          organizationIds: [],
          dealIds: [],
          serviceIds: [],
          customFieldValues: [],
        },
      ],
    });

    expect(mockWidgetService.recalculateUserWidgets).toHaveBeenCalledTimes(1);
  });

  it("returns { ok: true, data: [...] } with array of created tasks", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({
      tasks: [
        {
          name: "Task One",
          userIds: [],
          contactIds: [],
          organizationIds: [],
          dealIds: [],
          serviceIds: [],
          customFieldValues: [],
        },
        {
          name: "Task Two",
          userIds: [],
          contactIds: [],
          organizationIds: [],
          dealIds: [],
          serviceIds: [],
          customFieldValues: [],
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toEqual(expect.objectContaining({ id: TASK_ID }));
    expect(result.data[1]).toEqual(expect.objectContaining({ id: TASK_ID_2 }));
  });
});

describe("UpdateManyTasksInteractor", () => {
  let mockUpdateRepo: any;
  let mockContactRepo: any;
  let mockOrgRepo: any;
  let mockDealRepo: any;
  let mockServiceRepo: any;
  let mockEventService: any;
  let mockWidgetService: any;

  const task1 = makeTaskDto();
  const task2 = makeTaskDto({ id: TASK_ID_2, name: "Task Two" });
  const updated1 = makeTaskDto({ name: "Updated One" });
  const updated2 = makeTaskDto({ id: TASK_ID_2, name: "Updated Two" });

  beforeEach(() => {
    vi.clearAllMocks();

    mockUpdateRepo = {
      getOrThrowUnscoped: vi.fn().mockResolvedValueOnce(task1).mockResolvedValueOnce(task2),
      getManyOrThrowUnscoped: vi.fn().mockResolvedValue([task1, task2]),
      updateTaskOrThrow: vi.fn().mockResolvedValueOnce(updated1).mockResolvedValueOnce(updated2),
    };
    mockContactRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockOrgRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockDealRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockServiceRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockEventService = { publish: vi.fn().mockResolvedValue(undefined) };
    mockWidgetService = { recalculateUserWidgets: vi.fn().mockResolvedValue(undefined) };
  });

  function createInteractor() {
    return new UpdateManyTasksInteractor(
      mockUpdateRepo,
      mockContactRepo,
      mockOrgRepo,
      mockDealRepo,
      mockServiceRepo,
      mockEventService,
      mockWidgetService,
    );
  }

  it("publishes TASK_UPDATED events with payload for each item", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      tasks: [
        { id: TASK_ID, name: "Updated One" },
        { id: TASK_ID_2, name: "Updated Two" },
      ],
    });

    const updatedCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.TASK_UPDATED,
    );
    expect(updatedCalls).toHaveLength(2);
    expect(updatedCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: TASK_ID,
        payload: expect.objectContaining({
          task: expect.objectContaining({ id: TASK_ID }),
          changes: expect.any(Object),
        }),
      }),
    );
    expect(updatedCalls[1][1]).toEqual(
      expect.objectContaining({
        entityId: TASK_ID_2,
        payload: expect.objectContaining({
          task: expect.objectContaining({ id: TASK_ID_2 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("calls widgetService.recalculateUserWidgets", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      tasks: [{ id: TASK_ID, name: "Updated One" }],
    });

    expect(mockWidgetService.recalculateUserWidgets).toHaveBeenCalledTimes(1);
  });

  it("returns { ok: true, data: [...] }", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({
      tasks: [
        { id: TASK_ID, name: "Updated One" },
        { id: TASK_ID_2, name: "Updated Two" },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(2);
  });
});

describe("DeleteManyTasksInteractor", () => {
  let mockDeleteRepo: any;
  let mockContactRepo: any;
  let mockOrgRepo: any;
  let mockDealRepo: any;
  let mockServiceRepo: any;
  let mockEventService: any;
  let mockWidgetService: any;

  const task1 = makeTaskDto();
  const task2 = makeTaskDto({ id: TASK_ID_2, name: "Task Two" });

  beforeEach(() => {
    vi.clearAllMocks();

    mockDeleteRepo = {
      getManyOrThrowUnscoped: vi.fn().mockResolvedValue([task1, task2]),
      deleteTaskOrThrow: vi.fn().mockResolvedValueOnce(task1).mockResolvedValueOnce(task2),
    };
    mockContactRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockOrgRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockDealRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockServiceRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockEventService = { publish: vi.fn().mockResolvedValue(undefined) };
    mockWidgetService = { recalculateUserWidgets: vi.fn().mockResolvedValue(undefined) };
  });

  function createInteractor() {
    return new DeleteManyTasksInteractor(
      mockDeleteRepo,
      mockContactRepo,
      mockOrgRepo,
      mockDealRepo,
      mockServiceRepo,
      mockEventService,
      mockWidgetService,
    );
  }

  it("publishes TASK_DELETED events with payload for each deleted item", async () => {
    const interactor = createInteractor();
    await interactor.invoke({ ids: [TASK_ID, TASK_ID_2] });

    const deletedCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.TASK_DELETED,
    );
    expect(deletedCalls).toHaveLength(2);
    expect(deletedCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: TASK_ID,
        payload: expect.objectContaining({ id: TASK_ID }),
      }),
    );
    expect(deletedCalls[1][1]).toEqual(
      expect.objectContaining({
        entityId: TASK_ID_2,
        payload: expect.objectContaining({ id: TASK_ID_2 }),
      }),
    );
  });

  it("calls widgetService.recalculateUserWidgets", async () => {
    const interactor = createInteractor();
    await interactor.invoke({ ids: [TASK_ID, TASK_ID_2] });

    expect(mockWidgetService.recalculateUserWidgets).toHaveBeenCalledTimes(1);
  });

  it("returns { ok: true, data: [...ids] }", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({ ids: [TASK_ID, TASK_ID_2] });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual([TASK_ID, TASK_ID_2]);
  });
});
