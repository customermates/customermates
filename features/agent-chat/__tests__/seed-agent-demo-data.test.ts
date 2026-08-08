import { beforeEach, describe, expect, it, vi } from "vitest";

import { Action, Resource } from "@/generated/prisma";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUserWithPermissions([
  { resource: Resource.organizations, action: Action.create },
  { resource: Resource.organizations, action: Action.readAll },
  { resource: Resource.contacts, action: Action.create },
  { resource: Resource.contacts, action: Action.readAll },
  { resource: Resource.services, action: Action.create },
  { resource: Resource.services, action: Action.readAll },
  { resource: Resource.deals, action: Action.create },
  { resource: Resource.deals, action: Action.readAll },
  { resource: Resource.tasks, action: Action.create },
  { resource: Resource.tasks, action: Action.readAll },
]);

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { SeedAgentDemoDataInteractor } from "../seed-agent-demo-data.interactor";

const EMPTY_SIGNALS = {
  contacts: false,
  organizations: false,
  deals: false,
  services: false,
  tasks: false,
  connectedAccounts: true,
};

function interactor(signals = EMPTY_SIGNALS) {
  const repo = {
    getWorkspaceSetupSignals: vi.fn().mockResolvedValue(signals),
  };
  const createOrganizations = {
    invoke: vi.fn().mockResolvedValue({
      ok: true,
      data: [{ id: "o1" }, { id: "o2" }, { id: "o3" }],
    }),
  };
  const createContacts = {
    invoke: vi.fn().mockResolvedValue({
      ok: true,
      data: [{ id: "c1" }, { id: "c2" }, { id: "c3" }, { id: "c4" }, { id: "c5" }],
    }),
  };
  const createServices = {
    invoke: vi.fn().mockResolvedValue({
      ok: true,
      data: [{ id: "s1" }, { id: "s2" }, { id: "s3" }],
    }),
  };
  const createDeals = {
    invoke: vi.fn().mockResolvedValue({
      ok: true,
      data: [{ id: "d1" }, { id: "d2" }, { id: "d3" }],
    }),
  };
  const createTasks = {
    invoke: vi.fn().mockResolvedValue({
      ok: true,
      data: [{ id: "t1" }, { id: "t2" }, { id: "t3" }, { id: "t4" }],
    }),
  };

  return {
    createOrganizations,
    createContacts,
    createTasks,
    subject: new SeedAgentDemoDataInteractor(
      repo as never,
      createOrganizations as never,
      createContacts as never,
      createServices as never,
      createDeals as never,
      createTasks as never,
    ),
  };
}

describe("SeedAgentDemoDataInteractor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a linked 18-record dataset for an empty workspace even when an account is connected", async () => {
    const setup = interactor();

    const result = await setup.subject.invoke();

    expect(result).toEqual({
      ok: true,
      data: { created: true, recordCount: 18 },
    });
    expect(setup.createOrganizations.invoke).toHaveBeenCalledOnce();
    expect(setup.createContacts.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        contacts: expect.arrayContaining([
          expect.objectContaining({
            organizationIds: ["o1"],
            userIds: [mockUser.id],
          }),
        ]),
      }),
    );
    expect(setup.createTasks.invoke).toHaveBeenCalledOnce();
  });

  it("does not add records when core CRM data already exists", async () => {
    const setup = interactor({ ...EMPTY_SIGNALS, contacts: true });

    const result = await setup.subject.invoke();

    expect(result).toEqual({
      ok: true,
      data: { created: false, recordCount: 0 },
    });
    expect(setup.createOrganizations.invoke).not.toHaveBeenCalled();
  });
});
