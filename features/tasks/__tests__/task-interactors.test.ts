import { describe, it, expect, vi, beforeEach } from "vitest";
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

import { CreateTaskInteractor } from "../upsert/create-task.interactor";
import { UpdateTaskInteractor } from "../upsert/update-task.interactor";
import { DeleteTaskInteractor } from "../delete/delete-task.interactor";
import { CreateManyTasksInteractor } from "../upsert/create-many-tasks.interactor";
import { UpdateManyTasksInteractor } from "../upsert/update-many-tasks.interactor";
import { DeleteManyTasksInteractor } from "../delete/delete-many-tasks.interactor";
import { DomainEvent } from "@/features/event/domain-events";

import { TaskWritePrecheckInteractor } from "../upsert/task-write-precheck.interactor";
import { ValidateSystemTaskIdsInteractor } from "../upsert/validate-system-task-ids.interactor";
import { ValidateSystemTaskNameInteractor } from "../upsert/validate-system-task-name.interactor";
import { ValidateAssigneeGuardInteractor } from "@/core/validation/validators/validate-assignee-guard.interactor";
import { ValidateContactIdsInteractor } from "@/core/validation/validators/validate-contact-ids.interactor";
import { ValidateCustomFieldValuesInteractor } from "@/core/validation/validators/validate-custom-field-values.interactor";
import { ValidateDealIdsInteractor } from "@/core/validation/validators/validate-deal-ids.interactor";
import { ValidateOrganizationIdsInteractor } from "@/core/validation/validators/validate-organization-ids.interactor";
import { ValidateServiceIdsInteractor } from "@/core/validation/validators/validate-service-ids.interactor";
import { ValidateTaskIdsInteractor } from "@/core/validation/validators/validate-task-ids.interactor";
import { ValidateUserIdsInteractor } from "@/core/validation/validators/validate-user-ids.interactor";
import {
  getOrganizationRepo,
  getUserRepo,
  getDealRepo,
  getTaskRepo,
  getContactRepo,
  getServiceRepo,
  getCustomColumnRepo,
  getUserService,
} from "@/core/di";
import type { UserService } from "@/features/user/user.service";

const TASK_ID = "00000000-0000-4000-8000-000000000001";
const TASK_ID_2 = "00000000-0000-4000-8000-000000000002";
const ORG_ID_1 = "00000000-0000-4000-8000-000000000010";
const CONTACT_ID_1 = "00000000-0000-4000-8000-000000000020";
const DEAL_ID_1 = "00000000-0000-4000-8000-000000000030";
const SERVICE_ID_1 = "00000000-0000-4000-8000-000000000040";

function makeOrgDto(id: string) {
  return { id, name: `Org ${id.slice(-2)}` };
}

function makeContactDto(id: string) {
  return { id, firstName: "Linked", lastName: "Contact" };
}

function makeDealDto(id: string) {
  return { id, name: `Deal ${id.slice(-2)}` };
}

function makeServiceDto(id: string) {
  return { id, name: `Service ${id.slice(-2)}` };
}

function makeTaskWritePrecheck(): TaskWritePrecheckInteractor {
  return new TaskWritePrecheckInteractor(
    new ValidateOrganizationIdsInteractor(getOrganizationRepo()),
    new ValidateUserIdsInteractor(getUserRepo()),
    new ValidateDealIdsInteractor(getDealRepo()),
    new ValidateTaskIdsInteractor(getTaskRepo()),
    new ValidateContactIdsInteractor(getContactRepo()),
    new ValidateServiceIdsInteractor(getServiceRepo()),
    new ValidateCustomFieldValuesInteractor(getCustomColumnRepo()),
    new ValidateAssigneeGuardInteractor(getUserService() as unknown as UserService),
    new ValidateSystemTaskNameInteractor(getTaskRepo()),
    new ValidateSystemTaskIdsInteractor(getTaskRepo()),
  );
}

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

  beforeEach(() => {
    vi.clearAllMocks();

    mockCreateRepo = {
      createTaskOrThrow: vi.fn().mockResolvedValue(makeTaskDto()),
    };
    mockContactRepo = { getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]) };
    mockOrgRepo = { getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]) };
    mockDealRepo = { getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]) };
    mockServiceRepo = { getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]) };
    mockEventService = {
      publish: vi.fn().mockResolvedValue(undefined),
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
      makeTaskWritePrecheck(),
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

  it("publishes CONTACT_UPDATED events with payload for linked contacts", async () => {
    const contact = makeContactDto(CONTACT_ID_1);
    mockContactRepo.getManyOrThrowCompanyWide
      .mockResolvedValueOnce([{ ...contact, tasks: [] }])
      .mockResolvedValueOnce([{ ...contact, tasks: [{ id: TASK_ID }] }]);

    const interactor = createInteractor();
    await interactor.invoke({
      name: "Test Task",
      userIds: [],
      contactIds: [CONTACT_ID_1],
      organizationIds: [],
      dealIds: [],
      serviceIds: [],
      customFieldValues: [],
    });

    const contactUpdateCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.CONTACT_UPDATED,
    );
    expect(contactUpdateCalls).toHaveLength(1);
    expect(contactUpdateCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: CONTACT_ID_1,
        payload: expect.objectContaining({
          contact: expect.objectContaining({ id: CONTACT_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("publishes ORGANIZATION_UPDATED events with payload for linked organizations", async () => {
    const org = makeOrgDto(ORG_ID_1);
    mockOrgRepo.getManyOrThrowCompanyWide
      .mockResolvedValueOnce([{ ...org, tasks: [] }])
      .mockResolvedValueOnce([{ ...org, tasks: [{ id: TASK_ID }] }]);

    const interactor = createInteractor();
    await interactor.invoke({
      name: "Test Task",
      userIds: [],
      contactIds: [],
      organizationIds: [ORG_ID_1],
      dealIds: [],
      serviceIds: [],
      customFieldValues: [],
    });

    const orgUpdateCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.ORGANIZATION_UPDATED,
    );
    expect(orgUpdateCalls).toHaveLength(1);
    expect(orgUpdateCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: ORG_ID_1,
        payload: expect.objectContaining({
          organization: expect.objectContaining({ id: ORG_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("publishes DEAL_UPDATED events with payload for linked deals", async () => {
    const deal = makeDealDto(DEAL_ID_1);
    mockDealRepo.getManyOrThrowCompanyWide
      .mockResolvedValueOnce([{ ...deal, tasks: [] }])
      .mockResolvedValueOnce([{ ...deal, tasks: [{ id: TASK_ID }] }]);

    const interactor = createInteractor();
    await interactor.invoke({
      name: "Test Task",
      userIds: [],
      contactIds: [],
      organizationIds: [],
      dealIds: [DEAL_ID_1],
      serviceIds: [],
      customFieldValues: [],
    });

    const dealUpdateCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.DEAL_UPDATED,
    );
    expect(dealUpdateCalls).toHaveLength(1);
    expect(dealUpdateCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: DEAL_ID_1,
        payload: expect.objectContaining({
          deal: expect.objectContaining({ id: DEAL_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("publishes SERVICE_UPDATED events with payload for linked services", async () => {
    const service = makeServiceDto(SERVICE_ID_1);
    mockServiceRepo.getManyOrThrowCompanyWide
      .mockResolvedValueOnce([{ ...service, tasks: [] }])
      .mockResolvedValueOnce([{ ...service, tasks: [{ id: TASK_ID }] }]);

    const interactor = createInteractor();
    await interactor.invoke({
      name: "Test Task",
      userIds: [],
      contactIds: [],
      organizationIds: [],
      dealIds: [],
      serviceIds: [SERVICE_ID_1],
      customFieldValues: [],
    });

    const serviceUpdateCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.SERVICE_UPDATED,
    );
    expect(serviceUpdateCalls).toHaveLength(1);
    expect(serviceUpdateCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: SERVICE_ID_1,
        payload: expect.objectContaining({
          service: expect.objectContaining({ id: SERVICE_ID_1 }),
          changes: expect.any(Object),
        }),
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

  beforeEach(() => {
    vi.clearAllMocks();

    mockUpdateRepo = {
      getOrThrowCompanyWide: vi.fn().mockResolvedValue(makeTaskDto()),
      getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([makeTaskDto()]),
      updateTaskOrThrow: vi.fn().mockResolvedValue(makeTaskDto()),
    };
    mockContactRepo = { getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]) };
    mockOrgRepo = { getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]) };
    mockDealRepo = { getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]) };
    mockServiceRepo = { getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]) };
    mockEventService = {
      publish: vi.fn().mockResolvedValue(undefined),
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
      makeTaskWritePrecheck(),
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

  beforeEach(() => {
    vi.clearAllMocks();

    mockDeleteRepo = {
      getOrThrowCompanyWide: vi.fn().mockResolvedValue(makeTaskDto()),
      deleteTaskOrThrow: vi.fn().mockResolvedValue(makeTaskDto()),
    };
    mockContactRepo = { getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]) };
    mockOrgRepo = { getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]) };
    mockDealRepo = { getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]) };
    mockServiceRepo = { getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]) };
    mockEventService = {
      publish: vi.fn().mockResolvedValue(undefined),
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
      makeTaskWritePrecheck(),
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

  it("returns { ok: true, data: id } with the deleted task id", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({ id: TASK_ID });

    expect(result.ok).toBe(true);
    expect(result.data).toBe(TASK_ID);
  });

  it("publishes ORGANIZATION_UPDATED when a linked organization loses the deleted task", async () => {
    const org = makeOrgDto(ORG_ID_1);
    mockDeleteRepo.getOrThrowCompanyWide.mockResolvedValue(
      makeTaskDto({ organizations: [{ id: ORG_ID_1, name: "Org 10" }] }),
    );
    mockOrgRepo.getManyOrThrowCompanyWide
      .mockResolvedValueOnce([{ ...org, tasks: [{ id: TASK_ID }] }])
      .mockResolvedValueOnce([{ ...org, tasks: [] }]);

    const interactor = createInteractor();
    await interactor.invoke({ id: TASK_ID });

    const orgUpdateCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.ORGANIZATION_UPDATED,
    );
    expect(orgUpdateCalls).toHaveLength(1);
    expect(orgUpdateCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: ORG_ID_1,
        payload: expect.objectContaining({
          organization: expect.objectContaining({ id: ORG_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });
});

describe("CreateManyTasksInteractor", () => {
  let mockCreateRepo: any;
  let mockContactRepo: any;
  let mockOrgRepo: any;
  let mockDealRepo: any;
  let mockServiceRepo: any;
  let mockEventService: any;

  const mockTask1 = makeTaskDto();
  const mockTask2 = makeTaskDto({ id: TASK_ID_2, name: "Task Two" });

  beforeEach(() => {
    vi.clearAllMocks();

    mockCreateRepo = {
      createTaskOrThrow: vi.fn().mockResolvedValueOnce(mockTask1).mockResolvedValueOnce(mockTask2),
    };
    mockContactRepo = { getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]) };
    mockOrgRepo = { getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]) };
    mockDealRepo = { getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]) };
    mockServiceRepo = { getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]) };
    mockEventService = { publish: vi.fn().mockResolvedValue(undefined) };
  });

  function createInteractor() {
    return new CreateManyTasksInteractor(
      mockCreateRepo,
      mockContactRepo,
      mockOrgRepo,
      mockDealRepo,
      mockServiceRepo,
      mockEventService,
      makeTaskWritePrecheck(),
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

  it("publishes ORGANIZATION_UPDATED for organizations linked across the batch", async () => {
    const org = makeOrgDto(ORG_ID_1);
    mockOrgRepo.getManyOrThrowCompanyWide
      .mockResolvedValueOnce([{ ...org, tasks: [] }])
      .mockResolvedValueOnce([{ ...org, tasks: [{ id: TASK_ID }] }]);

    const interactor = createInteractor();
    await interactor.invoke({
      tasks: [
        {
          name: "Task One",
          userIds: [],
          contactIds: [],
          organizationIds: [ORG_ID_1],
          dealIds: [],
          serviceIds: [],
          customFieldValues: [],
        },
      ],
    });

    const orgUpdateCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.ORGANIZATION_UPDATED,
    );
    expect(orgUpdateCalls).toHaveLength(1);
    expect(orgUpdateCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: ORG_ID_1,
        payload: expect.objectContaining({
          organization: expect.objectContaining({ id: ORG_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });
});

describe("UpdateManyTasksInteractor", () => {
  let mockUpdateRepo: any;
  let mockContactRepo: any;
  let mockOrgRepo: any;
  let mockDealRepo: any;
  let mockServiceRepo: any;
  let mockEventService: any;

  const task1 = makeTaskDto();
  const task2 = makeTaskDto({ id: TASK_ID_2, name: "Task Two" });
  const updated1 = makeTaskDto({ name: "Updated One" });
  const updated2 = makeTaskDto({ id: TASK_ID_2, name: "Updated Two" });

  beforeEach(() => {
    vi.clearAllMocks();

    mockUpdateRepo = {
      getOrThrowCompanyWide: vi.fn().mockResolvedValueOnce(task1).mockResolvedValueOnce(task2),
      getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([task1, task2]),
      updateTaskOrThrow: vi.fn().mockResolvedValueOnce(updated1).mockResolvedValueOnce(updated2),
    };
    mockContactRepo = { getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]) };
    mockOrgRepo = { getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]) };
    mockDealRepo = { getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]) };
    mockServiceRepo = { getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]) };
    mockEventService = { publish: vi.fn().mockResolvedValue(undefined) };
  });

  function createInteractor() {
    return new UpdateManyTasksInteractor(
      mockUpdateRepo,
      mockContactRepo,
      mockOrgRepo,
      mockDealRepo,
      mockServiceRepo,
      mockEventService,
      makeTaskWritePrecheck(),
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

  const task1 = makeTaskDto();
  const task2 = makeTaskDto({ id: TASK_ID_2, name: "Task Two" });

  beforeEach(() => {
    vi.clearAllMocks();

    mockDeleteRepo = {
      getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([task1, task2]),
      deleteTaskOrThrow: vi.fn().mockResolvedValueOnce(task1).mockResolvedValueOnce(task2),
    };
    mockContactRepo = { getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]) };
    mockOrgRepo = { getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]) };
    mockDealRepo = { getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]) };
    mockServiceRepo = { getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]) };
    mockEventService = { publish: vi.fn().mockResolvedValue(undefined) };
  });

  function createInteractor() {
    return new DeleteManyTasksInteractor(
      mockDeleteRepo,
      mockContactRepo,
      mockOrgRepo,
      mockDealRepo,
      mockServiceRepo,
      mockEventService,
      makeTaskWritePrecheck(),
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

  it("returns { ok: true, data: [...ids] }", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({ ids: [TASK_ID, TASK_ID_2] });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual([TASK_ID, TASK_ID_2]);
  });

  it("publishes ORGANIZATION_UPDATED when linked organizations lose batch-deleted tasks", async () => {
    const org = makeOrgDto(ORG_ID_1);
    mockDeleteRepo.getManyOrThrowCompanyWide.mockResolvedValue([
      makeTaskDto({ organizations: [{ id: ORG_ID_1, name: "Org 10" }] }),
    ]);
    mockOrgRepo.getManyOrThrowCompanyWide
      .mockResolvedValueOnce([{ ...org, tasks: [{ id: TASK_ID }] }])
      .mockResolvedValueOnce([{ ...org, tasks: [] }]);

    const interactor = createInteractor();
    await interactor.invoke({ ids: [TASK_ID] });

    const orgUpdateCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.ORGANIZATION_UPDATED,
    );
    expect(orgUpdateCalls).toHaveLength(1);
    expect(orgUpdateCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: ORG_ID_1,
        payload: expect.objectContaining({
          organization: expect.objectContaining({ id: ORG_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });
});
