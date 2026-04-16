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

import { CreateOrganizationInteractor } from "../upsert/create-organization.interactor";
import { UpdateOrganizationInteractor } from "../upsert/update-organization.interactor";
import { DeleteOrganizationInteractor } from "../delete/delete-organization.interactor";
import { CreateManyOrganizationsInteractor } from "../upsert/create-many-organizations.interactor";
import { UpdateManyOrganizationsInteractor } from "../upsert/update-many-organizations.interactor";
import { DeleteManyOrganizationsInteractor } from "../delete/delete-many-organizations.interactor";
import { DomainEvent } from "@/features/event/domain-events";

const ORG_ID = "00000000-0000-4000-8000-000000000001";
const ORG_ID_2 = "00000000-0000-4000-8000-000000000002";
const CONTACT_ID_1 = "00000000-0000-4000-8000-000000000010";
const CONTACT_ID_2 = "00000000-0000-4000-8000-000000000011";
const DEAL_ID_1 = "00000000-0000-4000-8000-000000000020";

function makeOrgDto(overrides: Record<string, unknown> = {}) {
  return {
    id: ORG_ID,
    name: "Test Org",
    notes: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    contacts: [],
    users: [],
    deals: [],
    customFieldValues: [],
    ...overrides,
  };
}

function makeContactDto(id: string) {
  return {
    id,
    firstName: "Jane",
    lastName: "Doe",
    notes: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    organizations: [],
    users: [],
    deals: [],
    customFieldValues: [],
  };
}

function makeDealDto(id: string) {
  return {
    id,
    name: `Deal ${id.slice(-2)}`,
    totalValue: 0,
    totalQuantity: 0,
    notes: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    organizations: [],
    users: [],
    contacts: [],
    services: [],
    customFieldValues: [],
  };
}

describe("CreateOrganizationInteractor", () => {
  let mockCreateRepo: any;
  let mockContactRepo: any;
  let mockDealRepo: any;
  let mockEventService: any;
  let mockWidgetService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCreateRepo = {
      createOrganizationOrThrow: vi.fn().mockResolvedValue(makeOrgDto()),
    };
    mockContactRepo = {
      getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]),
    };
    mockDealRepo = {
      getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]),
    };
    mockEventService = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
    mockWidgetService = {
      recalculateUserWidgets: vi.fn().mockResolvedValue(undefined),
    };
  });

  function createInteractor() {
    return new CreateOrganizationInteractor(
      mockCreateRepo,
      mockContactRepo,
      mockDealRepo,
      mockEventService,
      mockWidgetService,
    );
  }

  it("publishes ORGANIZATION_CREATED event with correct entityId and payload", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      name: "Test Org",
      contactIds: [],
      userIds: [],
      dealIds: [],
      customFieldValues: [],
    });

    expect(mockEventService.publish).toHaveBeenCalledWith(
      DomainEvent.ORGANIZATION_CREATED,
      expect.objectContaining({
        entityId: ORG_ID,
        payload: expect.objectContaining({ id: ORG_ID, name: "Test Org" }),
      }),
    );
  });

  it("calls widgetService.recalculateUserWidgets after creation", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      name: "Test Org",
      contactIds: [],
      userIds: [],
      dealIds: [],
      customFieldValues: [],
    });

    expect(mockWidgetService.recalculateUserWidgets).toHaveBeenCalledTimes(1);
  });

  it("publishes CONTACT_UPDATED events with payload for linked contacts", async () => {
    const contact1 = makeContactDto(CONTACT_ID_1);
    const contact2 = makeContactDto(CONTACT_ID_2);

    mockContactRepo.getManyOrThrowUnscoped.mockResolvedValue([contact1, contact2]);

    const orgWithContacts = makeOrgDto({
      contacts: [
        { id: CONTACT_ID_1, firstName: "Jane", lastName: "Doe" },
        { id: CONTACT_ID_2, firstName: "Jane", lastName: "Doe" },
      ],
    });
    mockCreateRepo.createOrganizationOrThrow.mockResolvedValue(orgWithContacts);

    const interactor = createInteractor();
    await interactor.invoke({
      name: "Test Org",
      contactIds: [CONTACT_ID_1, CONTACT_ID_2],
      userIds: [],
      dealIds: [],
      customFieldValues: [],
    });

    const contactUpdateCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.CONTACT_UPDATED,
    );
    expect(contactUpdateCalls).toHaveLength(2);
    expect(contactUpdateCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: CONTACT_ID_1,
        payload: expect.objectContaining({
          contact: expect.objectContaining({ id: CONTACT_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
    expect(contactUpdateCalls[1][1]).toEqual(
      expect.objectContaining({
        entityId: CONTACT_ID_2,
        payload: expect.objectContaining({
          contact: expect.objectContaining({ id: CONTACT_ID_2 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("publishes DEAL_UPDATED events with payload for linked deals", async () => {
    const deal = makeDealDto(DEAL_ID_1);
    mockDealRepo.getManyOrThrowUnscoped.mockResolvedValue([deal]);

    const orgWithDeals = makeOrgDto({
      deals: [{ id: DEAL_ID_1, name: "Deal 20" }],
    });
    mockCreateRepo.createOrganizationOrThrow.mockResolvedValue(orgWithDeals);

    const interactor = createInteractor();
    await interactor.invoke({
      name: "Test Org",
      contactIds: [],
      userIds: [],
      dealIds: [DEAL_ID_1],
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

  it("returns { ok: true, data: organization } with the created organization", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({
      name: "Test Org",
      contactIds: [],
      userIds: [],
      dealIds: [],
      customFieldValues: [],
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        id: ORG_ID,
        name: "Test Org",
      }),
    );
  });
});

describe("UpdateOrganizationInteractor", () => {
  let mockUpdateRepo: any;
  let mockContactRepo: any;
  let mockDealRepo: any;
  let mockEventService: any;
  let mockWidgetService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockUpdateRepo = {
      getOrThrowUnscoped: vi.fn().mockResolvedValue(makeOrgDto({ contacts: [], deals: [] })),
      updateOrganizationOrThrow: vi.fn().mockResolvedValue(makeOrgDto()),
    };
    mockContactRepo = {
      getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]),
    };
    mockDealRepo = {
      getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]),
    };
    mockEventService = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
    mockWidgetService = {
      recalculateUserWidgets: vi.fn().mockResolvedValue(undefined),
    };
  });

  function createInteractor() {
    return new UpdateOrganizationInteractor(
      mockUpdateRepo,
      mockContactRepo,
      mockDealRepo,
      mockEventService,
      mockWidgetService,
    );
  }

  it("publishes ORGANIZATION_UPDATED event with entityId and changes", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      id: ORG_ID,
      name: "Updated Org",
    });

    expect(mockEventService.publish).toHaveBeenCalledWith(
      DomainEvent.ORGANIZATION_UPDATED,
      expect.objectContaining({
        entityId: ORG_ID,
        payload: expect.objectContaining({
          organization: expect.objectContaining({ id: ORG_ID }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("calls widgetService.recalculateUserWidgets after update", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      id: ORG_ID,
      name: "Updated Org",
    });

    expect(mockWidgetService.recalculateUserWidgets).toHaveBeenCalledTimes(1);
  });

  it("returns { ok: true, data: organization } with the updated organization", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({
      id: ORG_ID,
      name: "Updated Org",
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        id: ORG_ID,
        name: "Test Org",
      }),
    );
  });
});

describe("DeleteOrganizationInteractor", () => {
  let mockDeleteRepo: any;
  let mockContactRepo: any;
  let mockDealRepo: any;
  let mockEventService: any;
  let mockWidgetService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    const orgDto = makeOrgDto({
      contacts: [{ id: CONTACT_ID_1, firstName: "Jane", lastName: "Doe" }],
      deals: [{ id: DEAL_ID_1, name: "Deal 20" }],
    });

    mockDeleteRepo = {
      getOrThrowUnscoped: vi.fn().mockResolvedValue(orgDto),
      deleteOrganizationOrThrow: vi.fn().mockResolvedValue(orgDto),
    };
    mockContactRepo = {
      getManyOrThrowUnscoped: vi.fn().mockResolvedValue([makeContactDto(CONTACT_ID_1)]),
    };
    mockDealRepo = {
      getManyOrThrowUnscoped: vi.fn().mockResolvedValue([makeDealDto(DEAL_ID_1)]),
    };
    mockEventService = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
    mockWidgetService = {
      recalculateUserWidgets: vi.fn().mockResolvedValue(undefined),
    };
  });

  function createInteractor() {
    return new DeleteOrganizationInteractor(
      mockDeleteRepo,
      mockContactRepo,
      mockDealRepo,
      mockEventService,
      mockWidgetService,
    );
  }

  it("publishes ORGANIZATION_DELETED event with correct entityId and payload", async () => {
    const interactor = createInteractor();
    await interactor.invoke({ id: ORG_ID });

    expect(mockEventService.publish).toHaveBeenCalledWith(
      DomainEvent.ORGANIZATION_DELETED,
      expect.objectContaining({
        entityId: ORG_ID,
        payload: expect.objectContaining({ id: ORG_ID }),
      }),
    );
  });

  it("publishes CONTACT_UPDATED events with payload for contacts linked to the deleted organization", async () => {
    const interactor = createInteractor();
    await interactor.invoke({ id: ORG_ID });

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

  it("publishes DEAL_UPDATED events with payload for deals linked to the deleted organization", async () => {
    const interactor = createInteractor();
    await interactor.invoke({ id: ORG_ID });

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

  it("calls widgetService.recalculateUserWidgets after deletion", async () => {
    const interactor = createInteractor();
    await interactor.invoke({ id: ORG_ID });

    expect(mockWidgetService.recalculateUserWidgets).toHaveBeenCalledTimes(1);
  });

  it("returns { ok: true, data: id } with the deleted organization id", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({ id: ORG_ID });

    expect(result.ok).toBe(true);
    expect(result.data).toBe(ORG_ID);
  });
});

describe("CreateManyOrganizationsInteractor", () => {
  let mockCreateRepo: any;
  let mockContactRepo: any;
  let mockDealRepo: any;
  let mockEventService: any;
  let mockWidgetService: any;

  const mockOrg1 = makeOrgDto();
  const mockOrg2 = makeOrgDto({ id: ORG_ID_2, name: "Org Two" });

  beforeEach(() => {
    vi.clearAllMocks();

    mockCreateRepo = {
      createOrganizationOrThrow: vi.fn().mockResolvedValueOnce(mockOrg1).mockResolvedValueOnce(mockOrg2),
    };
    mockContactRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockDealRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockEventService = { publish: vi.fn().mockResolvedValue(undefined) };
    mockWidgetService = { recalculateUserWidgets: vi.fn().mockResolvedValue(undefined) };
  });

  function createInteractor() {
    return new CreateManyOrganizationsInteractor(
      mockCreateRepo,
      mockContactRepo,
      mockDealRepo,
      mockEventService,
      mockWidgetService,
    );
  }

  it("publishes ORGANIZATION_CREATED events for each item created", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      organizations: [
        { name: "Org One", contactIds: [], userIds: [], dealIds: [], customFieldValues: [] },
        { name: "Org Two", contactIds: [], userIds: [], dealIds: [], customFieldValues: [] },
      ],
    });

    const createdCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.ORGANIZATION_CREATED,
    );
    expect(createdCalls).toHaveLength(2);
    expect(createdCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: ORG_ID,
        payload: expect.objectContaining({ id: ORG_ID, name: "Test Org" }),
      }),
    );
    expect(createdCalls[1][1]).toEqual(
      expect.objectContaining({
        entityId: ORG_ID_2,
        payload: expect.objectContaining({ id: ORG_ID_2, name: "Org Two" }),
      }),
    );
  });

  it("publishes CONTACT_UPDATED events with payload for related contacts", async () => {
    const contact = makeContactDto(CONTACT_ID_1);
    mockContactRepo.getManyOrThrowUnscoped.mockResolvedValue([contact]);
    mockCreateRepo.createOrganizationOrThrow.mockReset();
    mockCreateRepo.createOrganizationOrThrow.mockResolvedValueOnce(
      makeOrgDto({ contacts: [{ id: CONTACT_ID_1, firstName: "Jane", lastName: "Doe" }] }),
    );

    const interactor = createInteractor();
    await interactor.invoke({
      organizations: [{ name: "Org One", contactIds: [CONTACT_ID_1], userIds: [], dealIds: [], customFieldValues: [] }],
    });

    const contactCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.CONTACT_UPDATED,
    );
    expect(contactCalls).toHaveLength(1);
    expect(contactCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: CONTACT_ID_1,
        payload: expect.objectContaining({
          contact: expect.objectContaining({ id: CONTACT_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("calls widgetService.recalculateUserWidgets", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      organizations: [{ name: "Org One", contactIds: [], userIds: [], dealIds: [], customFieldValues: [] }],
    });

    expect(mockWidgetService.recalculateUserWidgets).toHaveBeenCalledTimes(1);
  });

  it("returns { ok: true, data: [...] } with array of created organizations", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({
      organizations: [
        { name: "Org One", contactIds: [], userIds: [], dealIds: [], customFieldValues: [] },
        { name: "Org Two", contactIds: [], userIds: [], dealIds: [], customFieldValues: [] },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toEqual(expect.objectContaining({ id: ORG_ID }));
    expect(result.data[1]).toEqual(expect.objectContaining({ id: ORG_ID_2 }));
  });
});

describe("UpdateManyOrganizationsInteractor", () => {
  let mockUpdateRepo: any;
  let mockContactRepo: any;
  let mockDealRepo: any;
  let mockEventService: any;
  let mockWidgetService: any;

  const org1 = makeOrgDto();
  const org2 = makeOrgDto({ id: ORG_ID_2, name: "Org Two" });
  const updated1 = makeOrgDto({ name: "Updated One" });
  const updated2 = makeOrgDto({ id: ORG_ID_2, name: "Updated Two" });

  beforeEach(() => {
    vi.clearAllMocks();

    mockUpdateRepo = {
      getManyOrThrowUnscoped: vi.fn().mockResolvedValue([org1, org2]),
      updateOrganizationOrThrow: vi.fn().mockResolvedValueOnce(updated1).mockResolvedValueOnce(updated2),
    };
    mockContactRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockDealRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockEventService = { publish: vi.fn().mockResolvedValue(undefined) };
    mockWidgetService = { recalculateUserWidgets: vi.fn().mockResolvedValue(undefined) };
  });

  function createInteractor() {
    return new UpdateManyOrganizationsInteractor(
      mockUpdateRepo,
      mockContactRepo,
      mockDealRepo,
      mockEventService,
      mockWidgetService,
    );
  }

  it("publishes ORGANIZATION_UPDATED events with payload for each item", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      organizations: [
        { id: ORG_ID, name: "Updated One" },
        { id: ORG_ID_2, name: "Updated Two" },
      ],
    });

    const updatedCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.ORGANIZATION_UPDATED,
    );
    expect(updatedCalls).toHaveLength(2);
    expect(updatedCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: ORG_ID,
        payload: expect.objectContaining({
          organization: expect.objectContaining({ id: ORG_ID }),
          changes: expect.any(Object),
        }),
      }),
    );
    expect(updatedCalls[1][1]).toEqual(
      expect.objectContaining({
        entityId: ORG_ID_2,
        payload: expect.objectContaining({
          organization: expect.objectContaining({ id: ORG_ID_2 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("publishes CONTACT_UPDATED events with payload when organizations have linked contacts", async () => {
    const contactBefore = { ...makeContactDto(CONTACT_ID_1), organizations: [] };
    const contactAfter = { ...makeContactDto(CONTACT_ID_1), organizations: [{ id: ORG_ID }] };

    mockContactRepo.getManyOrThrowUnscoped.mockResolvedValueOnce([contactBefore]).mockResolvedValueOnce([contactAfter]);

    const interactor = createInteractor();
    await interactor.invoke({
      organizations: [{ id: ORG_ID, name: "Updated One", contactIds: [CONTACT_ID_1] }],
    });

    const contactCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.CONTACT_UPDATED,
    );
    expect(contactCalls).toHaveLength(1);
    expect(contactCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: CONTACT_ID_1,
        payload: expect.objectContaining({
          contact: expect.objectContaining({ id: CONTACT_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("publishes DEAL_UPDATED events with payload when organizations have linked deals", async () => {
    const dealBefore = { ...makeDealDto(DEAL_ID_1), organizations: [] };
    const dealAfter = { ...makeDealDto(DEAL_ID_1), organizations: [{ id: ORG_ID }] };

    mockDealRepo.getManyOrThrowUnscoped.mockResolvedValueOnce([dealBefore]).mockResolvedValueOnce([dealAfter]);

    const interactor = createInteractor();
    await interactor.invoke({
      organizations: [{ id: ORG_ID, name: "Updated One", dealIds: [DEAL_ID_1] }],
    });

    const dealCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.DEAL_UPDATED,
    );
    expect(dealCalls).toHaveLength(1);
    expect(dealCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: DEAL_ID_1,
        payload: expect.objectContaining({
          deal: expect.objectContaining({ id: DEAL_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("calls widgetService.recalculateUserWidgets", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      organizations: [{ id: ORG_ID, name: "Updated One" }],
    });

    expect(mockWidgetService.recalculateUserWidgets).toHaveBeenCalledTimes(1);
  });

  it("returns { ok: true, data: [...] }", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({
      organizations: [
        { id: ORG_ID, name: "Updated One" },
        { id: ORG_ID_2, name: "Updated Two" },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(2);
  });
});

describe("DeleteManyOrganizationsInteractor", () => {
  let mockDeleteRepo: any;
  let mockContactRepo: any;
  let mockDealRepo: any;
  let mockEventService: any;
  let mockWidgetService: any;

  const org1 = makeOrgDto({
    contacts: [{ id: CONTACT_ID_1, firstName: "Jane", lastName: "Doe" }],
    deals: [{ id: DEAL_ID_1, name: "Deal 20" }],
  });
  const org2 = makeOrgDto({ id: ORG_ID_2, name: "Org Two" });

  beforeEach(() => {
    vi.clearAllMocks();

    mockDeleteRepo = {
      getManyOrThrowUnscoped: vi.fn().mockResolvedValue([org1, org2]),
      deleteOrganizationOrThrow: vi.fn().mockResolvedValueOnce(org1).mockResolvedValueOnce(org2),
    };
    mockContactRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([makeContactDto(CONTACT_ID_1)]) };
    mockDealRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([makeDealDto(DEAL_ID_1)]) };
    mockEventService = { publish: vi.fn().mockResolvedValue(undefined) };
    mockWidgetService = { recalculateUserWidgets: vi.fn().mockResolvedValue(undefined) };
  });

  function createInteractor() {
    return new DeleteManyOrganizationsInteractor(
      mockDeleteRepo,
      mockContactRepo,
      mockDealRepo,
      mockEventService,
      mockWidgetService,
    );
  }

  it("publishes ORGANIZATION_DELETED events with payload for each deleted item", async () => {
    const interactor = createInteractor();
    await interactor.invoke({ ids: [ORG_ID, ORG_ID_2] });

    const deletedCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.ORGANIZATION_DELETED,
    );
    expect(deletedCalls).toHaveLength(2);
    expect(deletedCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: ORG_ID,
        payload: expect.objectContaining({ id: ORG_ID }),
      }),
    );
    expect(deletedCalls[1][1]).toEqual(
      expect.objectContaining({
        entityId: ORG_ID_2,
        payload: expect.objectContaining({ id: ORG_ID_2 }),
      }),
    );
  });

  it("publishes related entity UPDATED events with payload", async () => {
    const interactor = createInteractor();
    await interactor.invoke({ ids: [ORG_ID, ORG_ID_2] });

    const contactCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.CONTACT_UPDATED,
    );
    const dealCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.DEAL_UPDATED,
    );
    expect(contactCalls).toHaveLength(1);
    expect(contactCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: CONTACT_ID_1,
        payload: expect.objectContaining({
          contact: expect.objectContaining({ id: CONTACT_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
    expect(dealCalls).toHaveLength(1);
    expect(dealCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: DEAL_ID_1,
        payload: expect.objectContaining({
          deal: expect.objectContaining({ id: DEAL_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("calls widgetService.recalculateUserWidgets", async () => {
    const interactor = createInteractor();
    await interactor.invoke({ ids: [ORG_ID, ORG_ID_2] });

    expect(mockWidgetService.recalculateUserWidgets).toHaveBeenCalledTimes(1);
  });

  it("returns { ok: true, data: [...ids] }", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({ ids: [ORG_ID, ORG_ID_2] });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual([ORG_ID, ORG_ID_2]);
  });
});
