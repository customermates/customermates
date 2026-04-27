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

import { CreateContactInteractor } from "../upsert/create-contact.interactor";
import { UpdateContactInteractor } from "../upsert/update-contact.interactor";
import { DeleteContactInteractor } from "../delete/delete-contact.interactor";
import { CreateManyContactsInteractor } from "../upsert/create-many-contacts.interactor";
import { UpdateManyContactsInteractor } from "../upsert/update-many-contacts.interactor";
import { DeleteManyContactsInteractor } from "../delete/delete-many-contacts.interactor";

import { DomainEvent } from "@/features/event/domain-events";

const CONTACT_ID = "00000000-0000-4000-8000-000000000001";
const CONTACT_ID_2 = "00000000-0000-4000-8000-000000000002";
const ORG_ID_1 = "00000000-0000-4000-8000-000000000010";
const ORG_ID_2 = "00000000-0000-4000-8000-000000000011";
const DEAL_ID_1 = "00000000-0000-4000-8000-000000000020";

function makeContactDto(overrides: Record<string, unknown> = {}) {
  return {
    id: CONTACT_ID,
    firstName: "Jane",
    lastName: "Doe",
    emails: [],
    notes: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    organizations: [],
    users: [],
    deals: [],
    customFieldValues: [],
    ...overrides,
  };
}

function makeOrgDto(id: string) {
  return { id, name: `Org ${id.slice(-2)}` };
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

describe("CreateContactInteractor", () => {
  let mockCreateRepo: any;
  let mockOrgRepo: any;
  let mockDealRepo: any;
  let mockEventService: any;
  let mockWidgetService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCreateRepo = {
      createContactOrThrow: vi.fn().mockResolvedValue(makeContactDto()),
    };
    mockOrgRepo = {
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
    return new CreateContactInteractor(mockCreateRepo, mockOrgRepo, mockDealRepo, mockEventService, mockWidgetService);
  }

  it("publishes CONTACT_CREATED event with correct entityId and payload", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      firstName: "Jane",
      lastName: "Doe",
      emails: [],
      organizationIds: [],
      userIds: [],
      dealIds: [],
      customFieldValues: [],
    });

    expect(mockEventService.publish).toHaveBeenCalledWith(
      DomainEvent.CONTACT_CREATED,
      expect.objectContaining({
        entityId: CONTACT_ID,
        payload: expect.objectContaining({ id: CONTACT_ID, firstName: "Jane" }),
      }),
    );
  });

  it("calls widgetService.recalculateUserWidgets after creation", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      firstName: "Jane",
      lastName: "Doe",
      emails: [],
      organizationIds: [],
      userIds: [],
      dealIds: [],
      customFieldValues: [],
    });

    expect(mockWidgetService.recalculateUserWidgets).toHaveBeenCalledTimes(1);
  });

  it("publishes ORGANIZATION_UPDATED events with payload for related organizations", async () => {
    const org1 = makeOrgDto(ORG_ID_1);
    const org2 = makeOrgDto(ORG_ID_2);

    mockOrgRepo.getManyOrThrowUnscoped.mockResolvedValue([org1, org2]);

    const contactWithOrgs = makeContactDto({
      organizations: [org1, org2],
    });
    mockCreateRepo.createContactOrThrow.mockResolvedValue(contactWithOrgs);

    const interactor = createInteractor();
    await interactor.invoke({
      firstName: "Jane",
      lastName: "Doe",
      emails: [],
      organizationIds: [ORG_ID_1, ORG_ID_2],
      userIds: [],
      dealIds: [],
      customFieldValues: [],
    });

    const orgUpdateCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.ORGANIZATION_UPDATED,
    );
    expect(orgUpdateCalls).toHaveLength(2);
    expect(orgUpdateCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: ORG_ID_1,
        payload: expect.objectContaining({
          organization: expect.objectContaining({ id: ORG_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
    expect(orgUpdateCalls[1][1]).toEqual(
      expect.objectContaining({
        entityId: ORG_ID_2,
        payload: expect.objectContaining({
          organization: expect.objectContaining({ id: ORG_ID_2 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("publishes DEAL_UPDATED events with payload for related deals", async () => {
    const deal = makeDealDto(DEAL_ID_1);

    mockDealRepo.getManyOrThrowUnscoped.mockResolvedValue([deal]);

    const contactWithDeals = makeContactDto({
      deals: [{ id: DEAL_ID_1, name: "Deal 20" }],
    });
    mockCreateRepo.createContactOrThrow.mockResolvedValue(contactWithDeals);

    const interactor = createInteractor();
    await interactor.invoke({
      firstName: "Jane",
      lastName: "Doe",
      emails: [],
      organizationIds: [],
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

  it("returns { ok: true, data: contact } with the created contact", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({
      firstName: "Jane",
      lastName: "Doe",
      emails: [],
      organizationIds: [],
      userIds: [],
      dealIds: [],
      customFieldValues: [],
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        id: CONTACT_ID,
        firstName: "Jane",
        lastName: "Doe",
        emails: [],
      }),
    );
  });
});

describe("DeleteContactInteractor", () => {
  let mockDeleteRepo: any;
  let mockOrgRepo: any;
  let mockDealRepo: any;
  let mockEventService: any;
  let mockWidgetService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    const contactDto = makeContactDto({
      organizations: [makeOrgDto(ORG_ID_1)],
      deals: [{ id: DEAL_ID_1, name: "Deal 20" }],
    });

    mockDeleteRepo = {
      getOrThrowUnscoped: vi.fn().mockResolvedValue(contactDto),
      deleteContactOrThrow: vi.fn().mockResolvedValue(contactDto),
    };
    mockOrgRepo = {
      getManyOrThrowUnscoped: vi.fn().mockResolvedValue([makeOrgDto(ORG_ID_1)]),
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
    return new DeleteContactInteractor(mockDeleteRepo, mockOrgRepo, mockDealRepo, mockEventService, mockWidgetService);
  }

  it("publishes CONTACT_DELETED event with correct entityId and payload", async () => {
    const interactor = createInteractor();
    await interactor.invoke({ id: CONTACT_ID });

    expect(mockEventService.publish).toHaveBeenCalledWith(
      DomainEvent.CONTACT_DELETED,
      expect.objectContaining({
        entityId: CONTACT_ID,
        payload: expect.objectContaining({ id: CONTACT_ID }),
      }),
    );
  });

  it("publishes ORGANIZATION_UPDATED events with payload for orgs linked to the deleted contact", async () => {
    const interactor = createInteractor();
    await interactor.invoke({ id: CONTACT_ID });

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

  it("publishes DEAL_UPDATED events with payload for deals linked to the deleted contact", async () => {
    const interactor = createInteractor();
    await interactor.invoke({ id: CONTACT_ID });

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
    await interactor.invoke({ id: CONTACT_ID });

    expect(mockWidgetService.recalculateUserWidgets).toHaveBeenCalledTimes(1);
  });

  it("returns { ok: true, data: id } with the deleted contact id", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({ id: CONTACT_ID });

    expect(result.ok).toBe(true);
    expect(result.data).toBe(CONTACT_ID);
  });
});

describe("UpdateContactInteractor", () => {
  let mockUpdateRepo: any;
  let mockOrgRepo: any;
  let mockDealRepo: any;
  let mockEventService: any;
  let mockWidgetService: any;

  const previousContact = makeContactDto({
    organizations: [makeOrgDto(ORG_ID_1)],
    deals: [{ id: DEAL_ID_1, name: "Deal 20" }],
  });

  const updatedContact = makeContactDto({
    firstName: "Janet",
    organizations: [makeOrgDto(ORG_ID_1), makeOrgDto(ORG_ID_2)],
    deals: [{ id: DEAL_ID_1, name: "Deal 20" }],
    updatedAt: new Date("2025-02-01"),
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockUpdateRepo = {
      getOrThrowUnscoped: vi.fn().mockResolvedValue(previousContact),
      updateContactOrThrow: vi.fn().mockResolvedValue(updatedContact),
    };
    mockOrgRepo = {
      getManyOrThrowUnscoped: vi
        .fn()
        .mockResolvedValueOnce([{ ...makeOrgDto(ORG_ID_1), contacts: [] }])
        .mockResolvedValueOnce([{ ...makeOrgDto(ORG_ID_1), contacts: [{ id: CONTACT_ID }] }]),
    };
    mockDealRepo = {
      getManyOrThrowUnscoped: vi
        .fn()
        .mockResolvedValueOnce([{ ...makeDealDto(DEAL_ID_1), contacts: [] }])
        .mockResolvedValueOnce([{ ...makeDealDto(DEAL_ID_1), contacts: [{ id: CONTACT_ID }] }]),
    };
    mockEventService = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
    mockWidgetService = {
      recalculateUserWidgets: vi.fn().mockResolvedValue(undefined),
    };
  });

  function createInteractor() {
    return new UpdateContactInteractor(mockUpdateRepo, mockOrgRepo, mockDealRepo, mockEventService, mockWidgetService);
  }

  it("publishes CONTACT_UPDATED event with entityId and changes payload", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      id: CONTACT_ID,
      firstName: "Janet",
      lastName: "Doe",
      emails: [],
      organizationIds: [ORG_ID_1, ORG_ID_2],
      userIds: [],
      dealIds: [DEAL_ID_1],
      customFieldValues: [],
    });

    expect(mockEventService.publish).toHaveBeenCalledWith(
      DomainEvent.CONTACT_UPDATED,
      expect.objectContaining({
        entityId: CONTACT_ID,
        payload: expect.objectContaining({
          contact: expect.objectContaining({ id: CONTACT_ID, firstName: "Janet" }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("publishes ORGANIZATION_UPDATED events with payload for linked organizations", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      id: CONTACT_ID,
      firstName: "Janet",
      lastName: "Doe",
      emails: [],
      organizationIds: [ORG_ID_1, ORG_ID_2],
      userIds: [],
      dealIds: [DEAL_ID_1],
      customFieldValues: [],
    });

    const orgUpdateCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.ORGANIZATION_UPDATED,
    );
    expect(orgUpdateCalls.length).toBeGreaterThanOrEqual(1);
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
    const interactor = createInteractor();
    await interactor.invoke({
      id: CONTACT_ID,
      firstName: "Janet",
      lastName: "Doe",
      emails: [],
      organizationIds: [ORG_ID_1],
      userIds: [],
      dealIds: [DEAL_ID_1],
      customFieldValues: [],
    });

    const dealUpdateCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.DEAL_UPDATED,
    );
    expect(dealUpdateCalls.length).toBeGreaterThanOrEqual(1);
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

  it("calls widgetService.recalculateUserWidgets", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      id: CONTACT_ID,
      firstName: "Janet",
      lastName: "Doe",
      emails: [],
      organizationIds: [],
      userIds: [],
      dealIds: [],
      customFieldValues: [],
    });

    expect(mockWidgetService.recalculateUserWidgets).toHaveBeenCalledTimes(1);
  });

  it("returns { ok: true, data: contact }", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({
      id: CONTACT_ID,
      firstName: "Janet",
      lastName: "Doe",
      emails: [],
      organizationIds: [],
      userIds: [],
      dealIds: [],
      customFieldValues: [],
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({ id: CONTACT_ID, firstName: "Janet" }));
  });
});

describe("CreateManyContactsInteractor", () => {
  let mockCreateRepo: any;
  let mockOrgRepo: any;
  let mockDealRepo: any;
  let mockEventService: any;
  let mockWidgetService: any;

  const mockContact1 = makeContactDto();
  const mockContact2 = makeContactDto({ id: CONTACT_ID_2, firstName: "John" });

  beforeEach(() => {
    vi.clearAllMocks();

    mockCreateRepo = {
      createContactOrThrow: vi.fn().mockResolvedValueOnce(mockContact1).mockResolvedValueOnce(mockContact2),
    };
    mockOrgRepo = {
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
    return new CreateManyContactsInteractor(
      mockCreateRepo,
      mockOrgRepo,
      mockDealRepo,
      mockEventService,
      mockWidgetService,
    );
  }

  it("publishes CONTACT_CREATED events for each item created", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      contacts: [
        {
          firstName: "Jane",
          lastName: "Doe",
          emails: [],
          organizationIds: [],
          userIds: [],
          dealIds: [],
          customFieldValues: [],
        },
        {
          firstName: "John",
          lastName: "Doe",
          emails: [],
          organizationIds: [],
          userIds: [],
          dealIds: [],
          customFieldValues: [],
        },
      ],
    });

    const createdCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.CONTACT_CREATED,
    );
    expect(createdCalls).toHaveLength(2);
    expect(createdCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: CONTACT_ID,
        payload: expect.objectContaining({ id: CONTACT_ID, firstName: "Jane" }),
      }),
    );
    expect(createdCalls[1][1]).toEqual(
      expect.objectContaining({
        entityId: CONTACT_ID_2,
        payload: expect.objectContaining({ id: CONTACT_ID_2, firstName: "John" }),
      }),
    );
  });

  it("publishes ORGANIZATION_UPDATED events with payload for related organizations", async () => {
    const org = makeOrgDto(ORG_ID_1);
    mockOrgRepo.getManyOrThrowUnscoped.mockResolvedValue([org]);
    mockCreateRepo.createContactOrThrow.mockReset();
    mockCreateRepo.createContactOrThrow.mockResolvedValueOnce(makeContactDto({ organizations: [org] }));

    const interactor = createInteractor();
    await interactor.invoke({
      contacts: [
        {
          firstName: "Jane",
          lastName: "Doe",
          emails: [],
          organizationIds: [ORG_ID_1],
          userIds: [],
          dealIds: [],
          customFieldValues: [],
        },
      ],
    });

    const orgCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.ORGANIZATION_UPDATED,
    );
    expect(orgCalls).toHaveLength(1);
    expect(orgCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: ORG_ID_1,
        payload: expect.objectContaining({
          organization: expect.objectContaining({ id: ORG_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("calls widgetService.recalculateUserWidgets", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      contacts: [
        {
          firstName: "Jane",
          lastName: "Doe",
          emails: [],
          organizationIds: [],
          userIds: [],
          dealIds: [],
          customFieldValues: [],
        },
        {
          firstName: "John",
          lastName: "Doe",
          emails: [],
          organizationIds: [],
          userIds: [],
          dealIds: [],
          customFieldValues: [],
        },
      ],
    });

    expect(mockWidgetService.recalculateUserWidgets).toHaveBeenCalledTimes(1);
  });

  it("returns { ok: true, data: [...] } with array of created contacts", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({
      contacts: [
        {
          firstName: "Jane",
          lastName: "Doe",
          emails: [],
          organizationIds: [],
          userIds: [],
          dealIds: [],
          customFieldValues: [],
        },
        {
          firstName: "John",
          lastName: "Doe",
          emails: [],
          organizationIds: [],
          userIds: [],
          dealIds: [],
          customFieldValues: [],
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toEqual(expect.objectContaining({ id: CONTACT_ID }));
    expect(result.data[1]).toEqual(expect.objectContaining({ id: CONTACT_ID_2 }));
  });
});

describe("UpdateManyContactsInteractor", () => {
  let mockUpdateRepo: any;
  let mockOrgRepo: any;
  let mockDealRepo: any;
  let mockEventService: any;
  let mockWidgetService: any;

  const contact1 = makeContactDto();
  const contact2 = makeContactDto({ id: CONTACT_ID_2, firstName: "John" });
  const updated1 = makeContactDto({ firstName: "Janet" });
  const updated2 = makeContactDto({ id: CONTACT_ID_2, firstName: "Johnny" });

  beforeEach(() => {
    vi.clearAllMocks();

    mockUpdateRepo = {
      getManyOrThrowUnscoped: vi.fn().mockResolvedValue([contact1, contact2]),
      updateContactOrThrow: vi.fn().mockResolvedValueOnce(updated1).mockResolvedValueOnce(updated2),
    };
    mockOrgRepo = {
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
    return new UpdateManyContactsInteractor(
      mockUpdateRepo,
      mockOrgRepo,
      mockDealRepo,
      mockEventService,
      mockWidgetService,
    );
  }

  it("publishes CONTACT_UPDATED events with payload for each item", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      contacts: [
        { id: CONTACT_ID, firstName: "Janet", lastName: "Doe" },
        { id: CONTACT_ID_2, firstName: "Johnny", lastName: "Doe" },
      ],
    });

    const updatedCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.CONTACT_UPDATED,
    );
    expect(updatedCalls).toHaveLength(2);
    expect(updatedCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: CONTACT_ID,
        payload: expect.objectContaining({
          contact: expect.objectContaining({ id: CONTACT_ID }),
          changes: expect.any(Object),
        }),
      }),
    );
    expect(updatedCalls[1][1]).toEqual(
      expect.objectContaining({
        entityId: CONTACT_ID_2,
        payload: expect.objectContaining({
          contact: expect.objectContaining({ id: CONTACT_ID_2 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("publishes ORGANIZATION_UPDATED events with payload when contacts have linked organizations", async () => {
    const orgBefore = { ...makeOrgDto(ORG_ID_1), contacts: [] };
    const orgAfter = { ...makeOrgDto(ORG_ID_1), contacts: [{ id: CONTACT_ID }] };

    mockOrgRepo.getManyOrThrowUnscoped.mockResolvedValueOnce([orgBefore]).mockResolvedValueOnce([orgAfter]);

    const interactor = createInteractor();
    await interactor.invoke({
      contacts: [{ id: CONTACT_ID, firstName: "Janet", lastName: "Doe", emails: [], organizationIds: [ORG_ID_1] }],
    });

    const orgUpdatedCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.ORGANIZATION_UPDATED,
    );
    expect(orgUpdatedCalls).toHaveLength(1);
    expect(orgUpdatedCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: ORG_ID_1,
        payload: expect.objectContaining({
          organization: expect.objectContaining({ id: ORG_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("publishes DEAL_UPDATED events with payload when contacts have linked deals", async () => {
    const dealBefore = { ...makeDealDto(DEAL_ID_1), contacts: [] };
    const dealAfter = { ...makeDealDto(DEAL_ID_1), contacts: [{ id: CONTACT_ID }] };

    mockDealRepo.getManyOrThrowUnscoped.mockResolvedValueOnce([dealBefore]).mockResolvedValueOnce([dealAfter]);

    const interactor = createInteractor();
    await interactor.invoke({
      contacts: [{ id: CONTACT_ID, firstName: "Janet", lastName: "Doe", emails: [], dealIds: [DEAL_ID_1] }],
    });

    const dealUpdatedCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.DEAL_UPDATED,
    );
    expect(dealUpdatedCalls).toHaveLength(1);
    expect(dealUpdatedCalls[0][1]).toEqual(
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
      contacts: [{ id: CONTACT_ID, firstName: "Janet", lastName: "Doe" }],
    });

    expect(mockWidgetService.recalculateUserWidgets).toHaveBeenCalledTimes(1);
  });

  it("returns { ok: true, data: [...] }", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({
      contacts: [
        { id: CONTACT_ID, firstName: "Janet", lastName: "Doe" },
        { id: CONTACT_ID_2, firstName: "Johnny", lastName: "Doe" },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(2);
  });
});

describe("DeleteManyContactsInteractor", () => {
  let mockDeleteRepo: any;
  let mockOrgRepo: any;
  let mockDealRepo: any;
  let mockEventService: any;
  let mockWidgetService: any;

  const contact1 = makeContactDto({
    organizations: [makeOrgDto(ORG_ID_1)],
    deals: [{ id: DEAL_ID_1, name: "Deal 20" }],
  });
  const contact2 = makeContactDto({ id: CONTACT_ID_2, firstName: "John" });

  beforeEach(() => {
    vi.clearAllMocks();

    mockDeleteRepo = {
      getManyOrThrowUnscoped: vi.fn().mockResolvedValue([contact1, contact2]),
      deleteContactOrThrow: vi.fn().mockResolvedValueOnce(contact1).mockResolvedValueOnce(contact2),
    };
    mockOrgRepo = {
      getManyOrThrowUnscoped: vi.fn().mockResolvedValue([makeOrgDto(ORG_ID_1)]),
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
    return new DeleteManyContactsInteractor(
      mockDeleteRepo,
      mockOrgRepo,
      mockDealRepo,
      mockEventService,
      mockWidgetService,
    );
  }

  it("publishes CONTACT_DELETED events with payload for each deleted item", async () => {
    const interactor = createInteractor();
    await interactor.invoke({ ids: [CONTACT_ID, CONTACT_ID_2] });

    const deletedCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.CONTACT_DELETED,
    );
    expect(deletedCalls).toHaveLength(2);
    expect(deletedCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: CONTACT_ID,
        payload: expect.objectContaining({ id: CONTACT_ID }),
      }),
    );
    expect(deletedCalls[1][1]).toEqual(
      expect.objectContaining({
        entityId: CONTACT_ID_2,
        payload: expect.objectContaining({ id: CONTACT_ID_2 }),
      }),
    );
  });

  it("publishes related entity UPDATED events with payload", async () => {
    const interactor = createInteractor();
    await interactor.invoke({ ids: [CONTACT_ID, CONTACT_ID_2] });

    const orgCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.ORGANIZATION_UPDATED,
    );
    const dealCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.DEAL_UPDATED,
    );
    expect(orgCalls).toHaveLength(1);
    expect(orgCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: ORG_ID_1,
        payload: expect.objectContaining({
          organization: expect.objectContaining({ id: ORG_ID_1 }),
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
    await interactor.invoke({ ids: [CONTACT_ID, CONTACT_ID_2] });

    expect(mockWidgetService.recalculateUserWidgets).toHaveBeenCalledTimes(1);
  });

  it("returns { ok: true, data: [...ids] }", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({ ids: [CONTACT_ID, CONTACT_ID_2] });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual([CONTACT_ID, CONTACT_ID_2]);
  });
});
