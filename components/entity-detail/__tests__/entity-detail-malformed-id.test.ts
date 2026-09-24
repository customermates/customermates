import type { EntityLoadState } from "@/core/base/base-custom-column-entity-modal.store";
import type { RootStore } from "@/core/stores/root.store";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { TenantUser } from "@/features/user/user.schema";

import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomColumnType, EntityType } from "@/generated/prisma";

import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
  createMockDiModule,
} from "@/tests/helpers/interactor-test-setup";

let currentUser: TenantUser = createMockUser();

const fixtures = vi.hoisted(() => {
  return {
    byIdRepo: {
      getContactById: vi.fn(),
      getOrganizationById: vi.fn(),
      getDealById: vi.fn(),
      getServiceById: vi.fn(),
      getTaskById: vi.fn(),
    },
    columnRepo: { findByEntityType: vi.fn() },
  };
});

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/core/di", async () => {
  const { GetContactByIdInteractor } = await import("@/features/contacts/get/get-contact-by-id.interactor");
  const { GetOrganizationByIdInteractor } = await import(
    "@/features/organizations/get/get-organization-by-id.interactor"
  );
  const { GetDealByIdInteractor } = await import("@/features/deals/get/get-deal-by-id.interactor");
  const { GetServiceByIdInteractor } = await import("@/features/services/get/get-service-by-id.interactor");
  const { GetTaskByIdInteractor } = await import("@/features/tasks/get/get-task-by-id.interactor");
  const { GetCustomColumnsByEntityTypeInteractor } = await import(
    "@/features/custom-column/get-custom-columns-by-entity-type.interactor"
  );

  return {
    ...createMockDiModule(() => currentUser),
    getGetContactByIdInteractor: () => new GetContactByIdInteractor(fixtures.byIdRepo, fixtures.columnRepo),
    getGetOrganizationByIdInteractor: () => new GetOrganizationByIdInteractor(fixtures.byIdRepo, fixtures.columnRepo),
    getGetDealByIdInteractor: () => new GetDealByIdInteractor(fixtures.byIdRepo, fixtures.columnRepo),
    getGetServiceByIdInteractor: () => new GetServiceByIdInteractor(fixtures.byIdRepo, fixtures.columnRepo),
    getGetTaskByIdInteractor: () => new GetTaskByIdInteractor(fixtures.byIdRepo, fixtures.columnRepo),
    getGetCustomColumnsByEntityTypeInteractor: () => new GetCustomColumnsByEntityTypeInteractor(fixtures.columnRepo),
  };
});

import { getContactByIdAction } from "@/app/[locale]/(protected)/contacts/actions";
import { getOrganizationByIdAction } from "@/app/[locale]/(protected)/organizations/actions";
import { getDealByIdAction } from "@/app/[locale]/(protected)/deals/actions";
import { getServiceByIdAction } from "@/app/[locale]/(protected)/services/actions";
import { getTaskByIdAction } from "@/app/[locale]/(protected)/tasks/actions";
import { ContactDetailStore } from "@/app/[locale]/(protected)/contacts/components/contact-detail.store";
import { OrganizationDetailStore } from "@/app/[locale]/(protected)/organizations/components/organization-detail.store";
import { DealDetailStore } from "@/app/[locale]/(protected)/deals/components/deal-detail.store";
import { ServiceDetailStore } from "@/app/[locale]/(protected)/services/components/service-detail.store";
import { TaskDetailStore } from "@/app/[locale]/(protected)/tasks/components/task-detail.store";
import { resolveEntityDetailPageState } from "@/components/entity-detail/entity-detail-page-state";
import {
  getGetDealByIdInteractor,
  getGetOrganizationByIdInteractor,
  getGetServiceByIdInteractor,
  getGetTaskByIdInteractor,
} from "@/core/di";

type ListStoreKey = "contactsStore" | "organizationsStore" | "dealsStore" | "servicesStore" | "tasksStore";

type DetailStore = {
  loadById: (id: string) => Promise<boolean>;
  entityLoadState: EntityLoadState;
  requestedEntityId: string | null;
  fetchedEntity: unknown;
};

const UNKNOWN_UUID = "00000000-0000-4000-8000-0000000000ff";

function regionColumn(entityType: EntityType): CustomColumnDto {
  return { id: "70000000-0000-4000-8000-000000000001", label: "Region", entityType, type: CustomColumnType.plain };
}

const UUID_ENTITIES = [
  {
    entityType: EntityType.organization,
    id: "xyz",
    repoMethod: "getOrganizationById" as const,
    action: getOrganizationByIdAction,
    interactor: getGetOrganizationByIdInteractor,
    createStore: (root: RootStore) => new OrganizationDetailStore(root),
    listStore: "organizationsStore" as const,
  },
  {
    entityType: EntityType.deal,
    id: "123",
    repoMethod: "getDealById" as const,
    action: getDealByIdAction,
    interactor: getGetDealByIdInteractor,
    createStore: (root: RootStore) => new DealDetailStore(root),
    listStore: "dealsStore" as const,
  },
  {
    entityType: EntityType.service,
    id: "not-a-uuid",
    repoMethod: "getServiceById" as const,
    action: getServiceByIdAction,
    interactor: getGetServiceByIdInteractor,
    createStore: (root: RootStore) => new ServiceDetailStore(root),
    listStore: "servicesStore" as const,
  },
  {
    entityType: EntityType.task,
    id: "not-a-uuid",
    repoMethod: "getTaskById" as const,
    action: getTaskByIdAction,
    interactor: getGetTaskByIdInteractor,
    createStore: (root: RootStore) => new TaskDetailStore(root),
    listStore: "tasksStore" as const,
  },
];

const ALL_ENTITIES = [
  ...UUID_ENTITIES,
  {
    entityType: EntityType.contact,
    id: "not-a-uuid",
    repoMethod: "getContactById" as const,
    action: getContactByIdAction,
    createStore: (root: RootStore) => new ContactDetailStore(root),
    listStore: "contactsStore" as const,
  },
];

function listStore() {
  const store = {
    customColumns: [] as CustomColumnDto[],
    setCustomColumns: vi.fn((columns: CustomColumnDto[]) => {
      store.customColumns = columns;
    }),
    refreshCustomColumns: vi.fn(),
    upsertItem: vi.fn(),
    removeItem: vi.fn(),
  };
  return store;
}

function rootStore() {
  const lists: Record<ListStoreKey, ReturnType<typeof listStore>> = {
    contactsStore: listStore(),
    organizationsStore: listStore(),
    dealsStore: listStore(),
    servicesStore: listStore(),
    tasksStore: listStore(),
  };

  return {
    lists,
    root: {
      ...lists,
      registerModalStore: vi.fn(),
      companyStore: { company: { dealWeightingColumnId: null } },
      userStore: {
        user: { id: "user-1" },
        can: vi.fn(() => true),
        canAccess: vi.fn(() => true),
        canManage: vi.fn(() => true),
      },
      loadingOverlayStore: { withLoading: (fn: () => unknown) => fn() },
      globalSearchModalStore: { pushRecentItem: vi.fn(), removeRecentItem: vi.fn() },
      localeStore: { locale: "en", getTranslation: (key: string) => key },
    } as unknown as RootStore,
  };
}

function givenSystemUser() {
  currentUser = createMockUser();
  Object.values(fixtures.byIdRepo).forEach((method) => method.mockResolvedValue(null));
  fixtures.columnRepo.findByEntityType.mockImplementation((entityType: EntityType) =>
    Promise.resolve([regionColumn(entityType)]),
  );
}

afterEach(() => {
  vi.clearAllMocks();
  currentUser = createMockUser();
});

describe("detail record with a malformed id", () => {
  it.each(ALL_ENTITIES)(
    "resolves the $entityType action to an absent record with the entity's custom columns",
    async ({ entityType, id, action }) => {
      givenSystemUser();

      await expect(action({ id })).resolves.toEqual({
        entity: null,
        customColumns: [regionColumn(entityType)],
      });
    },
  );

  it.each(UUID_ENTITIES)(
    "never hands a malformed $entityType id to the repository",
    async ({ id, action, repoMethod }) => {
      givenSystemUser();

      await action({ id }).catch(() => undefined);

      expect(fixtures.byIdRepo[repoMethod]).not.toHaveBeenCalled();
    },
  );

  it.each(ALL_ENTITIES)(
    "lands the $entityType detail store in the not-found page state with the list's columns intact",
    async ({ entityType, id, createStore, listStore: listKey }) => {
      givenSystemUser();
      const { root, lists } = rootStore();
      const store = createStore(root) as unknown as DetailStore;

      await expect(store.loadById(id)).resolves.toBe(false);

      expect(store.entityLoadState).toBe("not-found");
      expect(store.requestedEntityId).toBe(id);
      expect(store.fetchedEntity).toBeNull();
      expect(lists[listKey].setCustomColumns).toHaveBeenCalledWith([regionColumn(entityType)]);
      expect(
        resolveEntityDetailPageState({
          hasCurrentEntity: false,
          requestMatches: store.requestedEntityId === id,
          requestState: store.entityLoadState,
        }),
      ).toBe("not-found");
    },
  );

  it.each(UUID_ENTITIES)(
    "still rejects a malformed $entityType id for a user who may not read it, before loading any columns",
    async ({ id, action, createStore }) => {
      givenSystemUser();
      currentUser = createMockUserWithPermissions([]);

      await expect(action({ id })).rejects.toThrow("Access denied");
      expect(fixtures.columnRepo.findByEntityType).not.toHaveBeenCalled();

      const store = createStore(rootStore().root) as unknown as DetailStore;
      await store.loadById(id);

      expect(store.entityLoadState).toBe("error");
    },
  );

  it.each(UUID_ENTITIES)(
    "keeps the $entityType interactor's validation failure that REST and MCP report",
    async ({ id, interactor }) => {
      givenSystemUser();

      const result = await interactor().invoke({ id });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.issues[0]).toMatchObject({ path: ["id"], code: "invalid_format" });
    },
  );

  it.each(UUID_ENTITIES)(
    "looks a well-formed unknown $entityType id up and resolves it to an absent record",
    async ({ entityType, action, repoMethod }) => {
      givenSystemUser();

      await expect(action({ id: UNKNOWN_UUID })).resolves.toEqual({
        entity: null,
        customColumns: [regionColumn(entityType)],
      });
      expect(fixtures.byIdRepo[repoMethod]).toHaveBeenCalledWith(UNKNOWN_UUID);
    },
  );
});
