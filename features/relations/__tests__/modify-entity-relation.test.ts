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

import { ModifyEntityRelationInteractor } from "../modify-entity-relation.interactor";

const CONTACT = "11111111-1111-4111-8111-111111111111";
const ORG_EXISTING = "22222222-2222-4222-8222-222222222222";
const ORG_NEW = "33333333-3333-4333-8333-333333333333";
const DEAL = "44444444-4444-4444-8444-444444444444";
const SVC_EXISTING = "55555555-5555-4555-8555-555555555555";
const SVC_NEW = "66666666-6666-4666-8666-666666666666";

describe("ModifyEntityRelationInteractor", () => {
  let contactRepo: any;
  let dealRepo: any;
  let updateContacts: any;
  let updateDeals: any;
  let stubRepo: any;
  let stubPort: any;
  let stubValidator: any;

  beforeEach(() => {
    vi.clearAllMocks();
    contactRepo = { getOrThrowCompanyWide: vi.fn() };
    dealRepo = { getOrThrowCompanyWide: vi.fn() };
    updateContacts = { invoke: vi.fn().mockResolvedValue({ ok: true, data: [] }) };
    updateDeals = { invoke: vi.fn().mockResolvedValue({ ok: true, data: [] }) };
    stubRepo = { getOrThrowCompanyWide: vi.fn() };
    stubPort = { invoke: vi.fn().mockResolvedValue({ ok: true, data: [] }) };
    stubValidator = { invoke: vi.fn() };
  });

  function createInteractor() {
    return new ModifyEntityRelationInteractor(
      contactRepo,
      stubRepo,
      dealRepo,
      stubRepo,
      stubRepo,
      updateContacts,
      stubPort,
      updateDeals,
      stubPort,
      stubPort,
      stubValidator,
      stubValidator,
      stubValidator,
      stubValidator,
      stubValidator,
    );
  }

  it("add merges new relation ids without dropping existing ones", async () => {
    contactRepo.getOrThrowCompanyWide.mockResolvedValue({ id: CONTACT, organizations: [{ id: ORG_EXISTING }] });
    const result: any = await createInteractor().invoke({
      entity: "contact",
      sourceId: CONTACT,
      relation: "organizations",
      mode: "add",
      ids: [ORG_NEW],
    });

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ before: 1, after: 2 });
    expect(updateContacts.invoke).toHaveBeenCalledWith({
      contacts: [{ id: CONTACT, organizationIds: [ORG_EXISTING, ORG_NEW] }],
    });
  });

  it("remove subtracts only the listed ids", async () => {
    contactRepo.getOrThrowCompanyWide.mockResolvedValue({
      id: CONTACT,
      organizations: [{ id: ORG_EXISTING }, { id: ORG_NEW }],
    });
    const result: any = await createInteractor().invoke({
      entity: "contact",
      sourceId: CONTACT,
      relation: "organizations",
      mode: "remove",
      ids: [ORG_NEW],
    });

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ before: 2, after: 1 });
    expect(updateContacts.invoke).toHaveBeenCalledWith({
      contacts: [{ id: CONTACT, organizationIds: [ORG_EXISTING] }],
    });
  });

  it("deal->services add preserves existing quantities and defaults new services to 1", async () => {
    dealRepo.getOrThrowCompanyWide.mockResolvedValue({ id: DEAL, services: [{ id: SVC_EXISTING, quantity: 5 }] });
    const result: any = await createInteractor().invoke({
      entity: "deal",
      sourceId: DEAL,
      relation: "services",
      mode: "add",
      ids: [SVC_NEW],
    });

    expect(result.ok).toBe(true);
    expect(updateDeals.invoke).toHaveBeenCalledWith({
      deals: [
        {
          id: DEAL,
          services: [
            { serviceId: SVC_EXISTING, quantity: 5 },
            { serviceId: SVC_NEW, quantity: 1 },
          ],
        },
      ],
    });
  });

  it("deal->services remove keeps surviving services' quantities", async () => {
    dealRepo.getOrThrowCompanyWide.mockResolvedValue({
      id: DEAL,
      services: [
        { id: SVC_EXISTING, quantity: 5 },
        { id: SVC_NEW, quantity: 1 },
      ],
    });
    const result: any = await createInteractor().invoke({
      entity: "deal",
      sourceId: DEAL,
      relation: "services",
      mode: "remove",
      ids: [SVC_NEW],
    });

    expect(result.ok).toBe(true);
    expect(updateDeals.invoke).toHaveBeenCalledWith({
      deals: [{ id: DEAL, services: [{ serviceId: SVC_EXISTING, quantity: 5 }] }],
    });
  });

  it("rejects a disallowed (entity, relation) pair without touching the repos", async () => {
    const result: any = await createInteractor().invoke({
      entity: "service",
      sourceId: CONTACT,
      relation: "contacts",
      mode: "add",
      ids: [ORG_NEW],
    });

    expect(result.ok).toBe(false);
    expect(contactRepo.getOrThrowCompanyWide).not.toHaveBeenCalled();
    expect(updateContacts.invoke).not.toHaveBeenCalled();
  });
});
