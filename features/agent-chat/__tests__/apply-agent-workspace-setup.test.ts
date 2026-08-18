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
  { resource: Resource.company, action: Action.readOwn },
  { resource: Resource.company, action: Action.update },
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
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), setTag: vi.fn(), setUser: vi.fn() }));

import { ApplyAgentWorkspaceSetupInteractor } from "../apply-agent-workspace-setup.interactor";
import { buildAgentWorkspaceSetupPlan } from "../agent-workspace-setup";

const CONVERSATION_ID = "00000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-08-06T08:00:00.000Z");
const EMPTY_SIGNALS = {
  contacts: false,
  organizations: false,
  deals: false,
  services: false,
  tasks: false,
  connectedAccounts: false,
};
const SETUP_DATA = {
  useCase: "clientProjects" as const,
  businessName: "Acme Studio",
  goal: "Track client delivery from discovery to launch",
};

function id(prefix: number, index: number) {
  return `00000000-0000-4000-8${String(prefix).padStart(3, "0")}-${String(index + 1).padStart(12, "0")}`;
}

function setup(options: { signals?: typeof EMPTY_SIGNALS; existing?: object | null } = {}) {
  let columnIndex = 0;
  let widgetIndex = 0;
  const chatRepo = {
    findConversation: vi.fn().mockResolvedValue({ id: CONVERSATION_ID }),
    findReviewedWorkspaceSetup: vi.fn().mockResolvedValue({
      reviewMessageId: id(8, 0),
      plan: buildAgentWorkspaceSetupPlan(SETUP_DATA),
      planHash: "a".repeat(64),
    }),
    getWorkspaceSetupSignals: vi.fn().mockResolvedValue(options.signals ?? EMPTY_SIGNALS),
  };
  const setupRepo = {
    findAppliedSetupByReview: vi.fn().mockResolvedValue(options.existing ?? null),
    recordAppliedSetup: vi.fn().mockImplementation((data) => ({
      id: id(9, 0),
      ...data,
      appliedAt: NOW,
      cleanedAt: null,
    })),
  };
  const getCompanySettings = {
    invoke: vi.fn().mockResolvedValue({
      ok: true,
      data: { currency: "eur", terminology: { presets: [], labels: {} } },
    }),
  };
  const updateCompanySettings = {
    invoke: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  };
  const upsertCustomColumn = {
    invoke: vi.fn().mockImplementation(() => ({
      ok: true,
      data: { id: id(1, columnIndex++), updatedAt: NOW },
    })),
  };
  const createOrganizations = {
    invoke: vi.fn().mockImplementation((data) => ({
      ok: true,
      data: data.organizations.map((_: unknown, index: number) => ({
        id: id(2, index),
        updatedAt: NOW,
      })),
    })),
  };
  const createContacts = {
    invoke: vi.fn().mockImplementation((data) => ({
      ok: true,
      data: data.contacts.map((_: unknown, index: number) => ({
        id: id(3, index),
        updatedAt: NOW,
      })),
    })),
  };
  const createServices = {
    invoke: vi.fn().mockImplementation((data) => ({
      ok: true,
      data: data.services.map((_: unknown, index: number) => ({
        id: id(4, index),
        updatedAt: NOW,
      })),
    })),
  };
  const createDeals = {
    invoke: vi.fn().mockImplementation((data) => ({
      ok: true,
      data: data.deals.map((_: unknown, index: number) => ({
        id: id(5, index),
        updatedAt: NOW,
      })),
    })),
  };
  const createTasks = {
    invoke: vi.fn().mockImplementation((data) => ({
      ok: true,
      data: data.tasks.map((_: unknown, index: number) => ({
        id: id(6, index),
        updatedAt: NOW,
      })),
    })),
  };
  const upsertWidget = {
    invoke: vi.fn().mockImplementation(() => ({
      ok: true,
      data: { id: id(7, widgetIndex++), updatedAt: NOW },
    })),
  };

  return {
    chatRepo,
    setupRepo,
    updateCompanySettings,
    upsertCustomColumn,
    createOrganizations,
    createContacts,
    createServices,
    createDeals,
    createTasks,
    upsertWidget,
    subject: new ApplyAgentWorkspaceSetupInteractor({
      chatRepo,
      setupRepo,
      getCompanySettings,
      updateCompanySettings,
      upsertCustomColumn,
      createOrganizations,
      createContacts,
      createServices,
      createDeals,
      createTasks,
      upsertWidget,
    } as never),
  };
}

const INPUT = {
  conversationId: CONVERSATION_ID,
  commandId: "setup-command-1",
  planHash: "a".repeat(64),
};

describe("ApplyAgentWorkspaceSetupInteractor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("applies one reviewed plan as a linked, provenance-recorded transaction", async () => {
    const ctx = setup();

    await expect(ctx.subject.invoke(INPUT)).resolves.toEqual({
      ok: true,
      data: {
        status: "applied",
        setupId: id(9, 0),
      },
    });

    expect(ctx.updateCompanySettings.invoke).toHaveBeenCalledWith({
      terminology: expect.arrayContaining([
        { entityType: "contact", presetKey: "client" },
        { entityType: "deal", presetKey: "project" },
      ]),
    });
    expect(ctx.upsertCustomColumn.invoke).toHaveBeenCalledTimes(4);
    expect(ctx.upsertCustomColumn.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "singleSelect",
        options: {
          options: expect.arrayContaining([expect.objectContaining({ isDefault: false })]),
        },
      }),
    );
    expect(ctx.createContacts.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        contacts: expect.arrayContaining([
          expect.objectContaining({
            organizationIds: [id(2, 0)],
            userIds: [mockUser.id],
          }),
        ]),
      }),
    );
    expect(ctx.createDeals.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        deals: expect.arrayContaining([
          expect.objectContaining({
            organizationIds: [id(2, 0)],
            contactIds: [id(3, 0)],
            services: [{ serviceId: id(4, 0), quantity: 1 }],
          }),
        ]),
      }),
    );
    expect(ctx.createTasks.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        tasks: expect.arrayContaining([
          expect.objectContaining({
            dealIds: [id(5, 0)],
            organizationIds: [id(2, 0)],
            serviceIds: [id(4, 0)],
          }),
        ]),
      }),
    );
    expect(ctx.upsertWidget.invoke).toHaveBeenCalledTimes(3);
    expect(ctx.setupRepo.recordAppliedSetup).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: CONVERSATION_ID,
        reviewMessageId: id(8, 0),
        commandId: "setup-command-1",
        planHash: "a".repeat(64),
        resources: expect.arrayContaining([
          expect.objectContaining({ kind: "customColumn" }),
          expect.objectContaining({ kind: "organization" }),
          expect.objectContaining({ kind: "widget" }),
        ]),
      }),
    );
    expect(ctx.setupRepo.recordAppliedSetup.mock.calls[0]?.[0].resources).toHaveLength(20);
  });

  it("is idempotent for the same conversation command", async () => {
    const ctx = setup({ existing: { id: id(9, 0) } });

    await expect(ctx.subject.invoke(INPUT)).resolves.toMatchObject({
      ok: true,
      data: { status: "applied", setupId: id(9, 0) },
    });
    expect(ctx.updateCompanySettings.invoke).not.toHaveBeenCalled();
    expect(ctx.setupRepo.recordAppliedSetup).not.toHaveBeenCalled();
    expect(ctx.setupRepo.findAppliedSetupByReview).toHaveBeenCalledWith({
      conversationId: CONVERSATION_ID,
      reviewMessageId: id(8, 0),
      commandId: "setup-command-1",
      planHash: "a".repeat(64),
    });
  });

  it("does not mix generated setup data into a workspace that stopped being empty", async () => {
    const ctx = setup({ signals: { ...EMPTY_SIGNALS, deals: true } });

    await expect(ctx.subject.invoke(INPUT)).resolves.toMatchObject({
      ok: true,
      data: { status: "notEmpty", setupId: null },
    });
    expect(ctx.upsertCustomColumn.invoke).not.toHaveBeenCalled();
    expect(ctx.createOrganizations.invoke).not.toHaveBeenCalled();
    expect(ctx.setupRepo.recordAppliedSetup).not.toHaveBeenCalled();
  });

  it("rejects a substituted plan before idempotency and workspace checks", async () => {
    const ctx = setup();

    await expect(ctx.subject.invoke({ ...INPUT, planHash: "b".repeat(64) })).rejects.toThrow(
      "Workspace setup review has changed",
    );
    expect(ctx.setupRepo.findAppliedSetupByReview).not.toHaveBeenCalled();
    expect(ctx.chatRepo.getWorkspaceSetupSignals).not.toHaveBeenCalled();
    expect(ctx.updateCompanySettings.invoke).not.toHaveBeenCalled();
  });
});
