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

import { CreateContactInteractor } from "../upsert/create-contact.interactor";
import { UpdateContactInteractor } from "../upsert/update-contact.interactor";
import { DeleteContactInteractor } from "../delete/delete-contact.interactor";
import { CreateManyContactsInteractor } from "../upsert/create-many-contacts.interactor";
import { UpdateManyContactsInteractor } from "../upsert/update-many-contacts.interactor";
import { DeleteManyContactsInteractor } from "../delete/delete-many-contacts.interactor";

import { DomainEvent } from "@/features/event/domain-events";

import { ContactWritePrecheckInteractor } from "../upsert/contact-write-precheck.interactor";
import { ValidateIdentifierConflictsInteractor } from "../upsert/validate-identifier-conflicts.interactor";
import { ValidateAssigneeGuardInteractor } from "@/core/validation/validators/validate-assignee-guard.interactor";
import { ValidateContactIdsInteractor } from "@/core/validation/validators/validate-contact-ids.interactor";
import { ValidateCustomFieldValuesInteractor } from "@/core/validation/validators/validate-custom-field-values.interactor";
import { ValidateDealIdsInteractor } from "@/core/validation/validators/validate-deal-ids.interactor";
import { ValidateOrganizationIdsInteractor } from "@/core/validation/validators/validate-organization-ids.interactor";
import { ValidateTaskIdsInteractor } from "@/core/validation/validators/validate-task-ids.interactor";
import { ValidateUserIdsInteractor } from "@/core/validation/validators/validate-user-ids.interactor";
import {
  getOrganizationRepo,
  getUserRepo,
  getDealRepo,
  getTaskRepo,
  getContactRepo,
  getCustomColumnRepo,
  getUserService,
} from "@/core/di";
import type { UserService } from "@/features/user/user.service";

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
    avatarUrl: null,
    notes: null,
    identifiers: [],
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    organizations: [],
    users: [],
    deals: [],
    tasks: [],
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
    tasks: [],
    customFieldValues: [],
  };
}

function makeContactWritePrecheck(): ContactWritePrecheckInteractor {
  return new ContactWritePrecheckInteractor(
    new ValidateOrganizationIdsInteractor(getOrganizationRepo()),
    new ValidateUserIdsInteractor(getUserRepo()),
    new ValidateDealIdsInteractor(getDealRepo()),
    new ValidateTaskIdsInteractor(getTaskRepo()),
    new ValidateContactIdsInteractor(getContactRepo()),
    new ValidateCustomFieldValuesInteractor(getCustomColumnRepo()),
    new ValidateAssigneeGuardInteractor(getUserService() as unknown as UserService),
    new ValidateIdentifierConflictsInteractor(getContactRepo()),
    getContactRepo(),
  );
}

describe("ContactWritePrecheckInteractor identifier self-exclusion", () => {
  const ctx = { addIssue: vi.fn() } as any;

  function makePrecheck(findIdsResult: Map<string, string>) {
    const identifierConflicts = { invoke: vi.fn() };
    const contactByIds = { findIds: vi.fn().mockResolvedValue(findIdsResult) };
    const noop = () => ({ invoke: vi.fn() }) as any;
    const precheck = new ContactWritePrecheckInteractor(
      noop(),
      noop(),
      noop(),
      noop(),
      noop(),
      noop(),
      noop(),
      identifierConflicts as any,
      contactByIds as any,
    );
    return { precheck, identifierConflicts };
  }

  it("update self-excludes by the RESOLVED canonical id, not the raw contact key", async () => {
    const emailKey = "alice@example.com";
    const selfUuid = "00000000-0000-4000-8000-000000000099";
    const identifiers = [{ provider: "google", value: emailKey }];
    const { precheck, identifierConflicts } = makePrecheck(new Map([[emailKey, selfUuid]]));

    await precheck.update(
      {
        id: emailKey,
        identifiers,
        organizationIds: [],
        userIds: [],
        dealIds: [],
        taskIds: [],
        customFieldValues: [],
      } as any,
      ctx,
    );

    expect(identifierConflicts.invoke).toHaveBeenCalledWith(
      [{ selfContactId: selfUuid, identifiers }],
      ctx,
      expect.any(Function),
    );
  });

  it("updateMany self-excludes by each contact's RESOLVED canonical id", async () => {
    const emailKey = "bob@example.com";
    const selfUuid = "00000000-0000-4000-8000-000000000098";
    const identifiers = [{ provider: "google", value: emailKey }];
    const { precheck, identifierConflicts } = makePrecheck(new Map([[emailKey, selfUuid]]));

    await precheck.updateMany(
      {
        contacts: [
          {
            id: emailKey,
            identifiers,
            organizationIds: [],
            userIds: [],
            dealIds: [],
            taskIds: [],
            customFieldValues: [],
          },
        ],
      } as any,
      ctx,
    );

    expect(identifierConflicts.invoke).toHaveBeenCalledWith(
      [{ selfContactId: selfUuid, identifiers }],
      ctx,
      expect.any(Function),
    );
  });
});

describe("CreateContactInteractor", () => {
  let mockCreateRepo: any;
  let mockOrgRepo: any;
  let mockDealRepo: any;
  let mockTaskRepo: any;
  let mockEventService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCreateRepo = {
      createContactOrThrow: vi.fn().mockResolvedValue(makeContactDto()),
    };
    mockOrgRepo = {
      getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]),
    };
    mockDealRepo = {
      getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]),
    };
    mockTaskRepo = {
      getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]),
    };
    mockEventService = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
  });

  function createInteractor() {
    return new CreateContactInteractor(
      mockCreateRepo,
      mockOrgRepo,
      mockDealRepo,
      mockTaskRepo,
      mockEventService,
      makeContactWritePrecheck(),
    );
  }

  it("publishes CONTACT_CREATED event with correct entityId and payload", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      firstName: "Jane",
      lastName: "Doe",
      organizationIds: [],
      userIds: [],
      dealIds: [],
      taskIds: [],
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

  it("publishes ORGANIZATION_UPDATED events with payload for related organizations", async () => {
    const org1 = makeOrgDto(ORG_ID_1);
    const org2 = makeOrgDto(ORG_ID_2);

    mockOrgRepo.getManyOrThrowCompanyWide
      .mockResolvedValueOnce([
        { ...org1, contacts: [] },
        { ...org2, contacts: [] },
      ])
      .mockResolvedValueOnce([
        { ...org1, contacts: [{ id: CONTACT_ID }] },
        { ...org2, contacts: [{ id: CONTACT_ID }] },
      ]);

    const contactWithOrgs = makeContactDto({
      organizations: [org1, org2],
    });
    mockCreateRepo.createContactOrThrow.mockResolvedValue(contactWithOrgs);

    const interactor = createInteractor();
    await interactor.invoke({
      firstName: "Jane",
      lastName: "Doe",
      organizationIds: [ORG_ID_1, ORG_ID_2],
      userIds: [],
      dealIds: [],
      taskIds: [],
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

    mockDealRepo.getManyOrThrowCompanyWide
      .mockResolvedValueOnce([{ ...deal, contacts: [] }])
      .mockResolvedValueOnce([{ ...deal, contacts: [{ id: CONTACT_ID }] }]);

    const contactWithDeals = makeContactDto({
      deals: [{ id: DEAL_ID_1, name: "Deal 20" }],
    });
    mockCreateRepo.createContactOrThrow.mockResolvedValue(contactWithDeals);

    const interactor = createInteractor();
    await interactor.invoke({
      firstName: "Jane",
      lastName: "Doe",
      organizationIds: [],
      userIds: [],
      dealIds: [DEAL_ID_1],
      taskIds: [],
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
      organizationIds: [],
      userIds: [],
      dealIds: [],
      taskIds: [],
      customFieldValues: [],
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        id: CONTACT_ID,
        firstName: "Jane",
        lastName: "Doe",
      }),
    );
  });

  function createWithIdentifiers(identifiers: unknown[], precheck = makeContactWritePrecheck()) {
    const interactor = new CreateContactInteractor(
      mockCreateRepo,
      mockOrgRepo,
      mockDealRepo,
      mockTaskRepo,
      mockEventService,
      precheck,
    );
    return interactor.invoke({
      firstName: "Jane",
      lastName: "Doe",
      organizationIds: [],
      userIds: [],
      dealIds: [],
      taskIds: [],
      customFieldValues: [],
      identifiers,
    } as any);
  }

  it("creates a contact with no identifiers", async () => {
    const result: any = await createWithIdentifiers([]);

    expect(result.ok).toBe(true);
    expect(mockCreateRepo.createContactOrThrow).toHaveBeenCalledTimes(1);
    expect(mockCreateRepo.createContactOrThrow.mock.calls[0][0].identifiers).toEqual([]);
  });

  it("normalizes and persists multiple identifiers in one create", async () => {
    const result: any = await createWithIdentifiers([
      { provider: "mail", value: "Jane@Example.COM" },
      { provider: "linkedin", value: "jane-doe" },
    ]);

    expect(result.ok).toBe(true);
    expect(mockCreateRepo.createContactOrThrow).toHaveBeenCalledTimes(1);
    expect(mockCreateRepo.createContactOrThrow.mock.calls[0][0].identifiers).toEqual([
      expect.objectContaining({ provider: "mail", value: "jane@example.com" }),
      expect.objectContaining({ provider: "linkedin", value: "jane-doe" }),
    ]);
  });

  it("rejects an invalid identifier without writing or publishing", async () => {
    const result: any = await createWithIdentifiers([{ provider: "mail", value: "not-an-email" }]);

    expect(result.ok).toBe(false);
    expect(mockCreateRepo.createContactOrThrow).not.toHaveBeenCalled();
    expect(mockEventService.publish).not.toHaveBeenCalled();
  });

  it("rejects a duplicate within the submitted draft without writing or publishing", async () => {
    const result: any = await createWithIdentifiers([
      { provider: "mail", value: "jane@example.com" },
      { provider: "google", value: "jane@example.com" },
    ]);

    expect(result.ok).toBe(false);
    expect(mockCreateRepo.createContactOrThrow).not.toHaveBeenCalled();
    expect(mockEventService.publish).not.toHaveBeenCalled();
  });

  it("rejects an identifier already owned by another contact without writing", async () => {
    const owningRepo = {
      findIds: vi.fn().mockResolvedValue(new Map()),
      findIdentifierOwnersCompanyWide: vi.fn().mockResolvedValue(new Map([["email:jane@example.com", CONTACT_ID_2]])),
    };
    const precheck = new ContactWritePrecheckInteractor(
      new ValidateOrganizationIdsInteractor(getOrganizationRepo()),
      new ValidateUserIdsInteractor(getUserRepo()),
      new ValidateDealIdsInteractor(getDealRepo()),
      new ValidateTaskIdsInteractor(getTaskRepo()),
      new ValidateContactIdsInteractor(getContactRepo()),
      new ValidateCustomFieldValuesInteractor(getCustomColumnRepo()),
      new ValidateAssigneeGuardInteractor(getUserService() as unknown as UserService),
      new ValidateIdentifierConflictsInteractor(owningRepo as any),
      getContactRepo(),
    );

    const result: any = await createWithIdentifiers([{ provider: "mail", value: "jane@example.com" }], precheck);

    expect(result.ok).toBe(false);
    expect(mockCreateRepo.createContactOrThrow).not.toHaveBeenCalled();
  });
});

describe("DeleteContactInteractor", () => {
  let mockDeleteRepo: any;
  let mockOrgRepo: any;
  let mockDealRepo: any;
  let mockTaskRepo: any;
  let mockEventService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    const contactDto = makeContactDto({
      organizations: [makeOrgDto(ORG_ID_1)],
      deals: [{ id: DEAL_ID_1, name: "Deal 20" }],
    });

    mockDeleteRepo = {
      getOrThrowCompanyWide: vi.fn().mockResolvedValue(contactDto),
      deleteContactOrThrow: vi.fn().mockResolvedValue(contactDto),
    };
    mockOrgRepo = {
      getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([makeOrgDto(ORG_ID_1)]),
    };
    mockDealRepo = {
      getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([makeDealDto(DEAL_ID_1)]),
    };
    mockTaskRepo = {
      getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]),
    };
    mockEventService = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
  });

  function createInteractor() {
    return new DeleteContactInteractor(
      mockDeleteRepo,
      mockOrgRepo,
      mockDealRepo,
      mockTaskRepo,
      mockEventService,
      makeContactWritePrecheck(),
    );
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
    mockOrgRepo.getManyOrThrowCompanyWide
      .mockReset()
      .mockResolvedValueOnce([{ ...makeOrgDto(ORG_ID_1), contacts: [{ id: CONTACT_ID }] }])
      .mockResolvedValueOnce([{ ...makeOrgDto(ORG_ID_1), contacts: [] }]);

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
    mockDealRepo.getManyOrThrowCompanyWide
      .mockReset()
      .mockResolvedValueOnce([{ ...makeDealDto(DEAL_ID_1), contacts: [{ id: CONTACT_ID }] }])
      .mockResolvedValueOnce([{ ...makeDealDto(DEAL_ID_1), contacts: [] }]);

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
  let mockTaskRepo: any;
  let mockEventService: any;

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
      getOrThrowCompanyWide: vi.fn().mockResolvedValue(previousContact),
      updateContactOrThrow: vi.fn().mockResolvedValue(updatedContact),
    };
    mockOrgRepo = {
      getManyOrThrowCompanyWide: vi
        .fn()
        .mockResolvedValueOnce([{ ...makeOrgDto(ORG_ID_1), contacts: [] }])
        .mockResolvedValueOnce([{ ...makeOrgDto(ORG_ID_1), contacts: [{ id: CONTACT_ID }] }]),
    };
    mockDealRepo = {
      getManyOrThrowCompanyWide: vi
        .fn()
        .mockResolvedValueOnce([{ ...makeDealDto(DEAL_ID_1), contacts: [] }])
        .mockResolvedValueOnce([{ ...makeDealDto(DEAL_ID_1), contacts: [{ id: CONTACT_ID }] }]),
    };
    mockTaskRepo = {
      getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]),
    };
    mockEventService = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
  });

  function createInteractor() {
    return new UpdateContactInteractor(
      mockUpdateRepo,
      mockOrgRepo,
      mockDealRepo,
      mockTaskRepo,
      mockEventService,
      makeContactWritePrecheck(),
    );
  }

  it("publishes CONTACT_UPDATED event with entityId and changes payload", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      id: CONTACT_ID,
      firstName: "Janet",
      lastName: "Doe",
      organizationIds: [ORG_ID_1, ORG_ID_2],
      userIds: [],
      dealIds: [DEAL_ID_1],
      taskIds: [],
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
      organizationIds: [ORG_ID_1, ORG_ID_2],
      userIds: [],
      dealIds: [DEAL_ID_1],
      taskIds: [],
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
      organizationIds: [ORG_ID_1],
      userIds: [],
      dealIds: [DEAL_ID_1],
      taskIds: [],
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

  it("returns { ok: true, data: contact }", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({
      id: CONTACT_ID,
      firstName: "Janet",
      lastName: "Doe",
      organizationIds: [],
      userIds: [],
      dealIds: [],
      taskIds: [],
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
  let mockTaskRepo: any;
  let mockEventService: any;

  const mockContact1 = makeContactDto();
  const mockContact2 = makeContactDto({ id: CONTACT_ID_2, firstName: "John" });

  beforeEach(() => {
    vi.clearAllMocks();

    mockCreateRepo = {
      createContactOrThrow: vi.fn().mockResolvedValueOnce(mockContact1).mockResolvedValueOnce(mockContact2),
    };
    mockOrgRepo = {
      getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]),
    };
    mockDealRepo = {
      getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]),
    };
    mockTaskRepo = {
      getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]),
    };
    mockEventService = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
  });

  function createInteractor() {
    return new CreateManyContactsInteractor(
      mockCreateRepo,
      mockOrgRepo,
      mockDealRepo,
      mockTaskRepo,
      mockEventService,
      makeContactWritePrecheck(),
    );
  }

  it("publishes CONTACT_CREATED events for each item created", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      contacts: [
        {
          firstName: "Jane",
          lastName: "Doe",
          organizationIds: [],
          userIds: [],
          dealIds: [],
          taskIds: [],
          customFieldValues: [],
        },
        {
          firstName: "John",
          lastName: "Doe",
          organizationIds: [],
          userIds: [],
          dealIds: [],
          taskIds: [],
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
    mockOrgRepo.getManyOrThrowCompanyWide
      .mockResolvedValueOnce([{ ...org, contacts: [] }])
      .mockResolvedValueOnce([{ ...org, contacts: [{ id: CONTACT_ID }] }]);
    mockCreateRepo.createContactOrThrow.mockReset();
    mockCreateRepo.createContactOrThrow.mockResolvedValueOnce(makeContactDto({ organizations: [org] }));

    const interactor = createInteractor();
    await interactor.invoke({
      contacts: [
        {
          firstName: "Jane",
          lastName: "Doe",
          organizationIds: [ORG_ID_1],
          userIds: [],
          dealIds: [],
          taskIds: [],
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

  it("returns { ok: true, data: [...] } with array of created contacts", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({
      contacts: [
        {
          firstName: "Jane",
          lastName: "Doe",
          organizationIds: [],
          userIds: [],
          dealIds: [],
          taskIds: [],
          customFieldValues: [],
        },
        {
          firstName: "John",
          lastName: "Doe",
          organizationIds: [],
          userIds: [],
          dealIds: [],
          taskIds: [],
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
  let mockTaskRepo: any;
  let mockEventService: any;

  const contact1 = makeContactDto();
  const contact2 = makeContactDto({ id: CONTACT_ID_2, firstName: "John" });
  const updated1 = makeContactDto({ firstName: "Janet" });
  const updated2 = makeContactDto({ id: CONTACT_ID_2, firstName: "Johnny" });

  beforeEach(() => {
    vi.clearAllMocks();

    mockUpdateRepo = {
      getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([contact1, contact2]),
      updateContactOrThrow: vi.fn().mockResolvedValueOnce(updated1).mockResolvedValueOnce(updated2),
    };
    mockOrgRepo = {
      getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]),
    };
    mockDealRepo = {
      getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]),
    };
    mockTaskRepo = {
      getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]),
    };
    mockEventService = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
  });

  function createInteractor() {
    return new UpdateManyContactsInteractor(
      mockUpdateRepo,
      mockOrgRepo,
      mockDealRepo,
      mockTaskRepo,
      mockEventService,
      makeContactWritePrecheck(),
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

    mockOrgRepo.getManyOrThrowCompanyWide.mockResolvedValueOnce([orgBefore]).mockResolvedValueOnce([orgAfter]);

    const interactor = createInteractor();
    await interactor.invoke({
      contacts: [{ id: CONTACT_ID, firstName: "Janet", lastName: "Doe", organizationIds: [ORG_ID_1] }],
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

    mockDealRepo.getManyOrThrowCompanyWide.mockResolvedValueOnce([dealBefore]).mockResolvedValueOnce([dealAfter]);

    const interactor = createInteractor();
    await interactor.invoke({
      contacts: [{ id: CONTACT_ID, firstName: "Janet", lastName: "Doe", dealIds: [DEAL_ID_1] }],
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

  it("does not roll back when two inputs resolve to the same contact (update is idempotent, unlike delete)", async () => {
    const emailKey = "dupe@example.com";
    mockUpdateRepo.getManyOrThrowCompanyWide.mockResolvedValue([contact1]);
    mockUpdateRepo.updateContactOrThrow.mockReset();
    mockUpdateRepo.updateContactOrThrow.mockResolvedValue(updated1);

    const result: any = await createInteractor().invoke({
      contacts: [
        { id: CONTACT_ID, firstName: "Janet", lastName: "Doe" },
        { id: emailKey, firstName: "Janet", lastName: "Doe" },
      ],
    });

    expect(result.ok).toBe(true);
    expect(mockUpdateRepo.updateContactOrThrow).toHaveBeenCalledTimes(2);
  });
});

describe("DeleteManyContactsInteractor", () => {
  let mockDeleteRepo: any;
  let mockOrgRepo: any;
  let mockDealRepo: any;
  let mockTaskRepo: any;
  let mockEventService: any;

  const contact1 = makeContactDto({
    organizations: [makeOrgDto(ORG_ID_1)],
    deals: [{ id: DEAL_ID_1, name: "Deal 20" }],
  });
  const contact2 = makeContactDto({ id: CONTACT_ID_2, firstName: "John" });

  beforeEach(() => {
    vi.clearAllMocks();

    mockDeleteRepo = {
      getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([contact1, contact2]),
      deleteContactOrThrow: vi.fn().mockResolvedValueOnce(contact1).mockResolvedValueOnce(contact2),
    };
    mockOrgRepo = {
      getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([makeOrgDto(ORG_ID_1)]),
    };
    mockDealRepo = {
      getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([makeDealDto(DEAL_ID_1)]),
    };
    mockTaskRepo = {
      getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]),
    };
    mockEventService = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
  });

  function createInteractor() {
    return new DeleteManyContactsInteractor(
      mockDeleteRepo,
      mockOrgRepo,
      mockDealRepo,
      mockTaskRepo,
      mockEventService,
      makeContactWritePrecheck(),
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
    mockOrgRepo.getManyOrThrowCompanyWide
      .mockReset()
      .mockResolvedValueOnce([{ ...makeOrgDto(ORG_ID_1), contacts: [{ id: CONTACT_ID }] }])
      .mockResolvedValueOnce([{ ...makeOrgDto(ORG_ID_1), contacts: [] }]);
    mockDealRepo.getManyOrThrowCompanyWide
      .mockReset()
      .mockResolvedValueOnce([{ ...makeDealDto(DEAL_ID_1), contacts: [{ id: CONTACT_ID }] }])
      .mockResolvedValueOnce([{ ...makeDealDto(DEAL_ID_1), contacts: [] }]);

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

  it("returns { ok: true, data: [...ids] }", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({ ids: [CONTACT_ID, CONTACT_ID_2] });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual([CONTACT_ID, CONTACT_ID_2]);
  });

  it("deletes once (idempotent) when two keys resolve to the same contact", async () => {
    const emailKey = "dupe@example.com";
    mockDeleteRepo.getManyOrThrowCompanyWide.mockResolvedValue([contact1]);
    mockDeleteRepo.deleteContactOrThrow.mockReset();
    mockDeleteRepo.deleteContactOrThrow.mockResolvedValue(contact1);

    const result: any = await createInteractor().invoke({ ids: [CONTACT_ID, emailKey] });

    expect(result.ok).toBe(true);
    expect(mockDeleteRepo.deleteContactOrThrow).toHaveBeenCalledTimes(1);
    expect(mockDeleteRepo.deleteContactOrThrow).toHaveBeenCalledWith(CONTACT_ID);
    expect(result.data).toEqual([CONTACT_ID]);
    const deletedCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.CONTACT_DELETED,
    );
    expect(deletedCalls).toHaveLength(1);
  });
});
