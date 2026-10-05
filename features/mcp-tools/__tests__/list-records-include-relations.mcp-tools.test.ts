import type { TenantUser } from "@/features/user/user.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { GroupableFieldSpec } from "@/core/base/grouping/groupable-field";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { Action, Resource } from "@/generated/prisma";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, createMockDiModule, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

const spies = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/prisma/db", () => ({ prisma: {} }));
vi.mock("@/features/search/entity-list-executors", () => {
  const entities = ["contact", "organization", "deal", "service", "task"];
  return {
    entityListExecutors: Object.fromEntries(entities.map((entity) => [entity, spies.list])),
    entityNameExtractors: Object.fromEntries(entities.map((entity) => [entity, (item: { name: string }) => item.name])),
  };
});

import { groupableFieldDtos } from "@/core/base/grouping/groupable-field";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { PrismaContactRepo } from "@/features/contacts/prisma-contact.repository";
import { PrismaDealRepo } from "@/features/deals/prisma-deal.repository";
import { PrismaOrganizationRepo } from "@/features/organizations/prisma-organization.repository";
import { PrismaServiceRepo } from "@/features/services/prisma-service.repository";
import { PrismaTaskRepo } from "@/features/tasks/prisma-task.repository";

import { linkIdKeys, listedLinks, listRecordsTool } from "../entity-generic.mcp-tools";

type Entity = keyof typeof listedLinks;
type IncludeKey = (typeof linkIdKeys)[keyof typeof linkIdKeys] | "userIds";

const repositories: Record<
  Entity,
  () => { getGroupableFields(customColumns?: readonly CustomColumnDto[]): Promise<GroupableFieldSpec[]> }
> = {
  contact: () => new PrismaContactRepo(),
  organization: () => new PrismaOrganizationRepo(),
  deal: () => new PrismaDealRepo({ getDealWeightingColumnId: () => Promise.resolve(null) }),
  service: () => new PrismaServiceRepo(),
  task: () => new PrismaTaskRepo(),
};

const READ_RESOURCE: Record<IncludeKey, Resource> = {
  userIds: Resource.users,
  contactIds: Resource.contacts,
  organizationIds: Resource.organizations,
  dealIds: Resource.deals,
  serviceIds: Resource.services,
  taskIds: Resource.tasks,
};

const EVERY_RESOURCE = Object.values(READ_RESOURCE);

const linkedItem = {
  id: "record-1",
  name: "Record",
  users: [{ id: "user-1" }],
  contacts: [{ id: "contact-1" }],
  organizations: [{ id: "organization-1" }],
  deals: [{ id: "deal-1" }],
  services: [{ id: "service-1" }],
  tasks: [{ id: "task-1" }],
};

function reader(readAll: readonly Resource[], readOwn: readonly Resource[] = []) {
  return createMockUserWithPermissions([
    ...readAll.map((resource) => ({ resource, action: Action.readAll })),
    ...readOwn.map((resource) => ({ resource, action: Action.readOwn })),
  ]);
}

function includeKeys(entity: Entity): IncludeKey[] {
  return [...listedLinks[entity].map((relation) => linkIdKeys[relation]), "userIds" as const].sort();
}

async function readRelations(entity: Entity, user: TenantUser) {
  const specs = await runWithTenant(user, () => repositories[entity]().getGroupableFields([]));
  const groupableFields = groupableFieldDtos(specs);
  spies.list.mockResolvedValue({ ok: true, data: { items: [linkedItem], pagination: { total: 1 }, groupableFields } });

  const result = await listRecordsTool.execute(
    listRecordsTool.inputSchema.parse({ entity, include: ["owners", "links"] }),
  );
  if (typeof result === "string" || !("structuredContent" in result)) throw new Error(JSON.stringify(result));
  const [item] = result.structuredContent.items as Record<string, unknown>[];

  return {
    grouped: groupableFields.filter((field) => field.kind === "relation").map((field) => field.id),
    included: Object.keys(item)
      .filter((key) => key !== "id" && key !== "name")
      .sort(),
  };
}

const ENTITIES = Object.keys(listedLinks) as Entity[];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("list_records include reads the relations each repository declares as groupable", () => {
  it.each(ENTITIES)(
    "%s declares userIds and every link key include gives it, so a caller who reads them all gets each one",
    async (entity) => {
      const { grouped, included } = await readRelations(entity, reader(EVERY_RESOURCE));

      expect(grouped).toEqual(expect.arrayContaining(includeKeys(entity)));
      expect(included).toEqual(includeKeys(entity));
    },
  );

  it.each(ENTITIES)(
    "%s declares each of those relations exactly while the caller can read its records, own ones included",
    async (entity) => {
      for (const key of includeKeys(entity)) {
        const others = EVERY_RESOURCE.filter((resource) => resource !== READ_RESOURCE[key]);
        const ownOnly = await readRelations(entity, reader(others, [READ_RESOURCE[key]]));
        const unreadable = await readRelations(entity, reader(others));

        expect([key, ownOnly.grouped.includes(key), ownOnly.included]).toEqual([key, true, includeKeys(entity)]);
        expect([key, unreadable.grouped.includes(key), unreadable.included]).toEqual([
          key,
          false,
          includeKeys(entity).filter((other) => other !== key),
        ]);
      }
    },
  );
});
