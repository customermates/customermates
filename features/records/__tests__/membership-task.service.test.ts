import type { RecordModel } from "../record-model.schema";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({ env: { APP_MODE: "cloud" } }));
vi.mock("@/core/decorators/transaction-runner", () => ({
  runInTransaction: (fn: () => unknown) => fn(),
}));

import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUser } from "@/tests/helpers/mock-user";
import { MembershipTaskService } from "../membership-task.service";

const USER_ID = "70000000-0000-4000-8000-000000000001";
const TASKS = "70000000-0000-4000-8000-000000000002";
const PROJECTS = "70000000-0000-4000-8000-000000000003";

function model(capabilities: RecordModel["capabilities"]): RecordModel {
  const type = (id: string, label: string) => ({
    id,
    label,
    pluralLabel: label,
    icon: "check",
    description: "",
    primaryFieldId: null,
    parentRelationshipId: null,
    archived: false,
    embedded: false,
    navigationVisible: true,
    position: 0,
  });
  return {
    revision: 1,
    types: [type(TASKS, "Tasks"), type(PROJECTS, "Projects")],
    fields: [],
    relationships: [],
    accessPresets: [],
    capabilities,
  };
}

function service(state: { revision: number } | null, current: RecordModel) {
  const records = {
    getState: vi.fn(() => Promise.resolve(state ? { ...state, activeOperationId: null } : null)),
    getModel: vi.fn(() => Promise.resolve(current)),
  };
  const tasks = {
    getMemberCompanyWide: vi.fn(() =>
      Promise.resolve({ id: USER_ID, email: "pending@example.com", status: "pendingAuthorization" }),
    ),
    findCompanyWide: vi.fn(() => Promise.resolve([])),
    count: vi.fn(() => Promise.resolve(0)),
  };
  const policy = {
    load: vi.fn(() =>
      Promise.resolve({
        actor: { id: USER_ID },
        allowedSystem: () => true,
        access: (typeIds: string[]) => new Map(typeIds.map((typeId) => [typeId, { access: "all" }])),
      }),
    ),
  };
  return {
    records,
    tasks,
    service: new MembershipTaskService(records as never, tasks as never, policy as never, {} as never),
  };
}

const membership = (id: string, typeId: string) => ({
  id,
  kind: "membershipAuthorization" as const,
  typeId,
  fields: [],
});
const run = <T>(work: () => Promise<T>) => runWithTenant(createMockUser({ id: USER_ID }), work);

describe("MembershipTaskService", () => {
  it("does nothing for a workspace without a record model", async () => {
    const { service: tasksService, records, tasks } = service(null, model([]));
    await expect(run(() => tasksService.registered(USER_ID))).resolves.toBeUndefined();
    await expect(run(() => tasksService.updated(USER_ID))).resolves.toBeUndefined();
    expect(records.getModel).not.toHaveBeenCalled();
    expect(tasks.findCompanyWide).not.toHaveBeenCalled();
  });

  it("does nothing while no list holds membership approvals", async () => {
    const { service: tasksService, tasks } = service({ revision: 3 }, model([]));
    await expect(run(() => tasksService.registered(USER_ID))).resolves.toBeUndefined();
    expect(tasks.findCompanyWide).not.toHaveBeenCalled();
  });

  it("still refuses more than one membership list", async () => {
    const { service: tasksService } = service(
      { revision: 3 },
      model([membership("cap-1", TASKS), membership("cap-2", PROJECTS)]),
    );
    await expect(run(() => tasksService.registered(USER_ID))).rejects.toMatchObject({
      cause: expect.objectContaining({ code: "recordConfigurationInvalid" }),
    });
  });

  it("counts no system tasks without a record model or a membership list", async () => {
    for (const state of [null, { revision: 2 }]) {
      const { service: tasksService, tasks } = service(state, state ? model([]) : { ...model([]), revision: 0 });
      expect(await run(() => tasksService.getSystemTasksCount())).toBe(0);
      expect(tasks.count).not.toHaveBeenCalled();
    }
  });
});
