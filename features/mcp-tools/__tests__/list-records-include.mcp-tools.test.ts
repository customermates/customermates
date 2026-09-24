import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, createMockDiModule, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

const spies = vi.hoisted(() => ({
  listDeals: vi.fn(),
  listTasks: vi.fn(),
  listContacts: vi.fn(),
  listOrganizations: vi.fn(),
  listServices: vi.fn(),
}));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/features/search/entity-list-executors", () => ({
  entityListExecutors: {
    deal: spies.listDeals,
    task: spies.listTasks,
    contact: spies.listContacts,
    organization: spies.listOrganizations,
    service: spies.listServices,
  },
  entityNameExtractors: {
    deal: (item: { name: string }) => item.name,
    task: (item: { name: string }) => item.name,
    contact: (item: { firstName: string; lastName: string }) => `${item.firstName} ${item.lastName}`,
    organization: (item: { name: string }) => item.name,
    service: (item: { name: string }) => item.name,
  },
}));

import { listRecordsTool } from "../entity-generic.mcp-tools";

const ALL = ["owners", "links", "customFields", "dates"] as const;
const created = new Date("2026-08-01T08:00:00.000Z");
const updated = new Date("2026-09-01T06:55:15.000Z");
const notes = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Private note body" }] }] };
const ada = {
  id: "user-ada",
  firstName: "Ada",
  lastName: "Tester",
  avatarUrl: "https://example.com/ada.png",
  email: "ada@example.com",
};
const maya = { id: "contact-maya", firstName: "Maya", lastName: "Chen", avatarUrl: "https://example.com/maya.png" };

const deal = {
  id: "deal-1",
  name: "Rollout",
  totalValue: 1000,
  totalQuantity: 3,
  weightedValue: 500,
  notes,
  createdAt: created,
  updatedAt: updated,
  organizations: [{ id: "org-north", name: "Northwind Holdings" }],
  users: [ada],
  contacts: [maya],
  services: [{ id: "service-onboarding", name: "Onboarding Package", amount: 400, quantity: 3 }],
  tasks: [],
  customFieldValues: [
    { columnId: "column-status", value: "option-open" },
    { columnId: "column-reference", value: null },
  ],
};

const task = {
  id: "task-1",
  name: "Security review",
  type: "custom",
  notes,
  createdAt: created,
  updatedAt: updated,
  users: [ada],
  contacts: [],
  organizations: [],
  deals: [{ id: "deal-1", name: "Rollout" }],
  services: [{ id: "service-onboarding", name: "Onboarding Package", amount: 400 }],
  customFieldValues: [{ columnId: "column-task-status", value: "option-open" }],
};

const contact = {
  ...maya,
  notes,
  identifiers: [
    {
      id: "identifier-1",
      provider: "email",
      value: "maya.chen@example.com",
      messagingId: null,
      displayName: null,
      profileUrl: null,
    },
  ],
  createdAt: created,
  updatedAt: updated,
  organizations: [{ id: "org-north", name: "Northwind Holdings" }],
  users: [ada],
  deals: [{ id: "deal-1", name: "Rollout" }],
  tasks: [{ id: "task-1", name: "Security review", type: "custom" }],
  customFieldValues: [],
};

const organization = {
  id: "org-north",
  name: "Northwind Holdings",
  notes,
  createdAt: created,
  updatedAt: updated,
  contacts: [maya],
  users: [ada],
  deals: [{ id: "deal-1", name: "Rollout" }],
  tasks: [{ id: "task-1", name: "Security review", type: "custom" }],
  customFieldValues: [],
};

const service = {
  id: "service-onboarding",
  name: "Onboarding Package",
  amount: 400,
  notes,
  createdAt: created,
  updatedAt: updated,
  users: [ada],
  deals: [{ id: "deal-1", name: "Rollout" }],
  tasks: [],
  customFieldValues: [],
};

const grouping = {
  grouping: { field: "userIds" },
  kind: "relation",
  supportsDragWriteBack: false,
  total: 1,
  groups: [
    {
      key: ada.id,
      count: 1,
      labelKind: "value",
      label: "Ada Tester",
      isNoValue: false,
      materialised: false,
      itemIds: [],
      hasMore: false,
      valueSums: { totalValue: 1000, weightedValue: 500 },
    },
  ],
};

function listing(item: unknown) {
  return (params: { grouping?: unknown }) =>
    Promise.resolve({
      ok: true,
      data: {
        items: params.grouping ? [] : [item],
        pagination: { total: 1 },
        ...(params.grouping ? { grouping, valueSums: { totalValue: 1000, weightedValue: 500 } } : {}),
      },
    });
}

async function list(args: Record<string, unknown>) {
  const result = await listRecordsTool.execute(listRecordsTool.inputSchema.parse(args));
  if (typeof result === "string" || !("structuredContent" in result)) throw new Error(JSON.stringify(result));
  return result;
}

async function firstItem(args: Record<string, unknown>) {
  const { structuredContent } = await list(args);
  return (structuredContent.items as Record<string, unknown>[])[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  spies.listDeals.mockImplementation(listing(deal));
  spies.listTasks.mockImplementation(listing(task));
  spies.listContacts.mockImplementation(listing(contact));
  spies.listOrganizations.mockImplementation(listing(organization));
  spies.listServices.mockImplementation(listing(service));
});

describe("list_records include", () => {
  it("leaves every item and the compact TOON table exactly as they were without include", async () => {
    const plain = await list({ entity: "deal" });

    expect(plain.structuredContent.items).toEqual([
      { id: "deal-1", name: "Rollout", totalValue: 1000, totalQuantity: 3, weightedValue: 500 },
    ]);
    expect(plain.text).toContain("items[1]{id,name,totalValue,totalQuantity,weightedValue}:");
    expect(await list({ entity: "deal", include: [] })).toEqual(plain);
    expect(await firstItem({ entity: "task" })).toEqual({ id: "task-1", name: "Security review" });
    expect(await firstItem({ entity: "contact" })).toEqual({ id: "contact-maya", name: "Maya Chen" });
  });

  it("adds the owners, every link array the deal has, its custom fields and ISO dates, keeping empty arrays", async () => {
    expect(await firstItem({ entity: "deal", include: [...ALL] })).toEqual({
      id: "deal-1",
      name: "Rollout",
      totalValue: 1000,
      totalQuantity: 3,
      weightedValue: 500,
      userIds: ["user-ada"],
      contactIds: ["contact-maya"],
      organizationIds: ["org-north"],
      serviceIds: ["service-onboarding"],
      taskIds: [],
      customFieldValues: [
        { columnId: "column-status", value: "option-open" },
        { columnId: "column-reference", value: null },
      ],
      createdAt: "2026-08-01T08:00:00.000Z",
      updatedAt: "2026-09-01T06:55:15.000Z",
    });
  });

  it("adds only the fields each include value names, and only the links the entity has", async () => {
    expect(await firstItem({ entity: "deal", include: ["owners"] })).toEqual({
      id: "deal-1",
      name: "Rollout",
      totalValue: 1000,
      totalQuantity: 3,
      weightedValue: 500,
      userIds: ["user-ada"],
    });
    expect(await firstItem({ entity: "task", include: ["links"] })).toEqual({
      id: "task-1",
      name: "Security review",
      contactIds: [],
      organizationIds: [],
      dealIds: ["deal-1"],
      serviceIds: ["service-onboarding"],
    });
    expect(await firstItem({ entity: "contact", include: ["links", "dates"] })).toEqual({
      id: "contact-maya",
      name: "Maya Chen",
      organizationIds: ["org-north"],
      dealIds: ["deal-1"],
      taskIds: ["task-1"],
      createdAt: "2026-08-01T08:00:00.000Z",
      updatedAt: "2026-09-01T06:55:15.000Z",
    });
    expect(await firstItem({ entity: "task", include: ["customFields"] })).toEqual({
      id: "task-1",
      name: "Security review",
      customFieldValues: [{ columnId: "column-task-status", value: "option-open" }],
    });
  });

  it("gives an organization exactly its contact, deal and task ids and a service exactly its deal and task ids", async () => {
    expect(await firstItem({ entity: "organization", include: ["links"] })).toEqual({
      id: "org-north",
      name: "Northwind Holdings",
      contactIds: ["contact-maya"],
      dealIds: ["deal-1"],
      taskIds: ["task-1"],
    });
    expect(await firstItem({ entity: "service", include: ["links"] })).toEqual({
      id: "service-onboarding",
      name: "Onboarding Package",
      amount: 400,
      dealIds: ["deal-1"],
      taskIds: [],
    });
  });

  it("never passes on notes, emails, avatars, contact identifiers or the names and quantities of linked records", async () => {
    const linkedNames = { deal: ["Maya"], task: ["Rollout"], contact: ["Rollout", "Security review"] };
    for (const [entity, names] of Object.entries(linkedNames)) {
      const output = JSON.stringify(await list({ entity, include: [...ALL] }));
      for (const leaked of [
        "Private note body",
        "ada@example.com",
        "avatar",
        "maya.chen@example.com",
        "identifier-1",
        "Onboarding Package",
        "Northwind Holdings",
        "Tester",
        '"quantity"',
        ...names,
      ])
        expect({ entity, leaked, found: output.includes(leaked) }).toEqual({ entity, leaked, found: false });
    }
  });

  it("ignores include with groupBy and never hands it to the list executor", async () => {
    const grouped = await list({ entity: "deal", groupBy: { field: "userIds" } });

    expect(await list({ entity: "deal", groupBy: { field: "userIds" }, include: [...ALL] })).toEqual(grouped);
    expect(grouped.structuredContent).toMatchObject({ groups: [{ key: "user-ada", count: 1 }], items: [] });
    await list({ entity: "deal", include: [...ALL] });
    for (const [params] of spies.listDeals.mock.calls) expect(params).not.toHaveProperty("include");
  });

  it("refuses an include value it does not know, a single string, and more than four values", () => {
    const parses = (include: unknown) => listRecordsTool.inputSchema.safeParse({ entity: "deal", include }).success;

    expect([[...ALL], [], ["customFields"]].map(parses)).toEqual([true, true, true]);
    expect([["notes"], ["emails"], "customFields", [...ALL, "owners"]].map(parses)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it("tells the model what include adds and how to read such items", () => {
    expect(listRecordsTool.description).toContain("Optional: searchTerm, filters, sortDescriptor, page, pageSize");
    expect(listRecordsTool.description).toMatch(/groupBy, include\./);
    for (const field of ["userIds", "taskIds", "customFieldValues", "createdAt"])
      expect(listRecordsTool.description).toContain(field);
    expect(listRecordsTool.description).toContain("read them through analyze_records");
    expect(listRecordsTool.description).toContain("pageSize 5");
  });
});
