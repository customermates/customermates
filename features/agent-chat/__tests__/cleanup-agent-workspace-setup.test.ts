import { beforeEach, describe, expect, it, vi } from "vitest";

import { Action, EntityType, Resource } from "@/generated/prisma";
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
  { resource: Resource.organizations, action: Action.delete },
  { resource: Resource.contacts, action: Action.delete },
  { resource: Resource.services, action: Action.delete },
  { resource: Resource.deals, action: Action.delete },
  { resource: Resource.tasks, action: Action.delete },
]);

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { CleanupAgentWorkspaceSetupInteractor } from "../cleanup-agent-workspace-setup.interactor";
import { buildAgentWorkspaceSetupPlan } from "../agent-workspace-setup";
import type { AgentSetupResourceKind, AgentWorkspaceSetupCleanupDecision } from "../agent-workspace-setup.repository";

const CONVERSATION_ID = "00000000-0000-4000-8000-000000000001";
const SETUP_ID = "00000000-0000-4000-8000-000000000002";
const INPUT = {
  conversationId: CONVERSATION_ID,
  setupId: SETUP_ID,
  planHash: "a".repeat(64),
  mode: "safe" as const,
};
const plan = buildAgentWorkspaceSetupPlan({
  useCase: "clientProjects",
  businessName: "Acme Studio",
  goal: "Track client delivery",
});
const priorTerminology = [
  { entityType: EntityType.contact, presetKey: "contact" },
  { entityType: EntityType.organization, presetKey: "organization" },
  { entityType: EntityType.deal, presetKey: "deal" },
  { entityType: EntityType.service, presetKey: "service" },
  { entityType: EntityType.task, presetKey: "task" },
];
const appliedTerminology = [
  { entityType: EntityType.contact, presetKey: "client" },
  { entityType: EntityType.organization, presetKey: "account" },
  { entityType: EntityType.deal, presetKey: "project" },
  { entityType: EntityType.service, presetKey: "service" },
  { entityType: EntityType.task, presetKey: "task" },
];

const resourceKinds: AgentSetupResourceKind[] = [
  "widget",
  "widget",
  "task",
  "task",
  "task",
  "task",
  "deal",
  "deal",
  "deal",
  "service",
  "service",
  "service",
  "contact",
  "contact",
  "contact",
  "organization",
  "organization",
  "customColumn",
  "customColumn",
  "customColumn",
];

const deleteDecisions: AgentWorkspaceSetupCleanupDecision[] = resourceKinds.map((kind, index) => ({
  provenanceId: `00000000-0000-4000-8001-${String(index + 1).padStart(12, "0")}`,
  kind,
  resourceId: `00000000-0000-4000-8002-${String(index + 1).padStart(12, "0")}`,
  action: "delete",
  reason: null,
}));

function retainedDecision(reason: "edited" | "dependent"): AgentWorkspaceSetupCleanupDecision {
  return {
    provenanceId: "00000000-0000-4000-8003-000000000001",
    kind: "contact",
    resourceId: "00000000-0000-4000-8004-000000000001",
    action: "retain",
    reason,
  };
}

function setup(
  options: {
    cleanedAt?: Date | null;
    setupStatus?: "applied" | "partiallyCleaned" | "cleaned";
    setupRetainedReason?: "edited" | "dependent";
    currentTerminology?: typeof appliedTerminology;
    cleanup?: AgentWorkspaceSetupCleanupDecision[];
    failingDeleteKind?: AgentSetupResourceKind;
  } = {},
) {
  const deleteOrder: AgentSetupResourceKind[] = [];
  const cleanup = options.cleanup ?? deleteDecisions;
  const chatRepo = {
    findConversation: vi.fn().mockResolvedValue({ id: CONVERSATION_ID }),
  };
  const setupRepo = {
    findAppliedSetupById: vi.fn().mockResolvedValue({
      id: SETUP_ID,
      conversationId: CONVERSATION_ID,
      reviewMessageId: "00000000-0000-4000-8000-000000000003",
      commandId: "setup-command-1",
      plan,
      planHash: INPUT.planHash,
      priorTerminology,
      status: options.setupStatus ?? "applied",
      resources: cleanup.map((decision) => ({
        provenanceId: decision.provenanceId,
        kind: decision.kind,
        resourceId: decision.resourceId,
        initialUpdatedAt: new Date("2026-08-06T08:00:00.000Z"),
        status: options.setupStatus === "partiallyCleaned" ? "retained" : "active",
        cleanupReason: options.setupStatus === "partiallyCleaned" ? (options.setupRetainedReason ?? "edited") : null,
      })),
      appliedAt: new Date("2026-08-06T08:00:00.000Z"),
      cleanedAt: options.cleanedAt ?? null,
    }),
    planCleanupOrThrow: vi.fn().mockResolvedValue({
      setupId: SETUP_ID,
      decisions: cleanup,
    }),
    recordCleanupResultOrThrow: vi.fn().mockResolvedValue(undefined),
  };
  const getCompanySettings = {
    invoke: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        currency: "eur",
        terminology: {
          presets: options.currentTerminology ?? appliedTerminology,
          labels: {},
        },
      },
    }),
  };
  const updateCompanySettings = {
    invoke: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  };

  const deleter = (kind: AgentSetupResourceKind) => ({
    invoke: vi.fn().mockImplementation(({ id }: { id: string }) => {
      deleteOrder.push(kind);
      if (options.failingDeleteKind === kind) return { ok: false, error: new Error(`Could not delete ${kind}`) };
      return { ok: true, data: id };
    }),
  });
  const deleteWidget = deleter("widget");
  const deleteTask = deleter("task");
  const deleteDeal = deleter("deal");
  const deleteService = deleter("service");
  const deleteContact = deleter("contact");
  const deleteOrganization = deleter("organization");
  const deleteCustomColumn = deleter("customColumn");

  return {
    setupRepo,
    getCompanySettings,
    updateCompanySettings,
    deleteOrder,
    deleteWidget,
    deleteTask,
    deleteDeal,
    deleteService,
    deleteContact,
    deleteOrganization,
    deleteCustomColumn,
    subject: new CleanupAgentWorkspaceSetupInteractor({
      chatRepo,
      setupRepo,
      getCompanySettings,
      updateCompanySettings,
      deleteWidget,
      deleteTask,
      deleteDeal,
      deleteService,
      deleteContact,
      deleteOrganization,
      deleteCustomColumn,
    } as never),
  };
}

describe("CleanupAgentWorkspaceSetupInteractor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("safely removes an unchanged generated setup and restores prior terminology", async () => {
    const ctx = setup();

    await expect(ctx.subject.invoke(INPUT)).resolves.toEqual({
      ok: true,
      data: {
        status: "cleaned",
        setupId: SETUP_ID,
        deletedResources: 20,
        retainedResources: 0,
        missingResources: 0,
        retainedReasons: [],
      },
    });
    expect(ctx.setupRepo.planCleanupOrThrow).toHaveBeenCalledWith({
      setupId: SETUP_ID,
      mode: "safe",
    });
    expect(ctx.setupRepo.findAppliedSetupById).toHaveBeenCalledWith({
      conversationId: CONVERSATION_ID,
      setupId: SETUP_ID,
      planHash: INPUT.planHash,
    });
    expect(ctx.deleteOrder).toEqual(resourceKinds);
    expect(ctx.updateCompanySettings.invoke).toHaveBeenCalledWith({
      terminology: priorTerminology,
    });
    expect(ctx.setupRepo.recordCleanupResultOrThrow).toHaveBeenCalledWith({
      setupId: SETUP_ID,
      decisions: deleteDecisions,
      completedAt: expect.any(Date),
    });
  });

  it("retains edited generated resources during safe cleanup and reports a partial result", async () => {
    const ctx = setup({
      cleanup: [...deleteDecisions.slice(0, 19), retainedDecision("edited")],
    });

    await expect(ctx.subject.invoke(INPUT)).resolves.toMatchObject({
      ok: true,
      data: {
        status: "partiallyCleaned",
        setupId: SETUP_ID,
        deletedResources: 19,
        retainedResources: 1,
        retainedReasons: ["edited"],
      },
    });
    expect(ctx.setupRepo.recordCleanupResultOrThrow).toHaveBeenCalledOnce();
  });

  it("preserves terminology the user changed after setup during safe cleanup", async () => {
    const ctx = setup({
      currentTerminology: [{ entityType: EntityType.contact, presetKey: "person" }, ...appliedTerminology.slice(1)],
    });

    await expect(ctx.subject.invoke(INPUT)).resolves.toMatchObject({
      ok: true,
      data: { status: "cleaned" },
    });
    expect(ctx.setupRepo.planCleanupOrThrow).toHaveBeenCalledOnce();
    expect(ctx.updateCompanySettings.invoke).not.toHaveBeenCalled();
  });

  it("does not overwrite terminology changes during an explicitly confirmed full cleanup", async () => {
    const ctx = setup({
      setupStatus: "partiallyCleaned",
      currentTerminology: [{ entityType: EntityType.contact, presetKey: "person" }, ...appliedTerminology.slice(1)],
    });

    await expect(ctx.subject.invoke({ ...INPUT, mode: "full" })).resolves.toMatchObject({
      ok: true,
      data: { status: "cleaned" },
    });
    expect(ctx.setupRepo.planCleanupOrThrow).toHaveBeenCalledWith({
      setupId: SETUP_ID,
      mode: "full",
    });
    expect(ctx.updateCompanySettings.invoke).not.toHaveBeenCalled();
  });

  it("retains generated resources with user-created dependents even during full cleanup", async () => {
    const ctx = setup({
      setupStatus: "partiallyCleaned",
      cleanup: [...deleteDecisions.slice(0, 19), retainedDecision("dependent")],
    });

    await expect(ctx.subject.invoke({ ...INPUT, mode: "full" })).resolves.toMatchObject({
      ok: true,
      data: {
        status: "partiallyCleaned",
        retainedResources: 1,
        retainedReasons: ["dependent"],
      },
    });
    expect(ctx.setupRepo.recordCleanupResultOrThrow).toHaveBeenCalledOnce();
  });

  it("defensively orders repository decisions before invoking destructive operations", async () => {
    const ctx = setup({ cleanup: [...deleteDecisions].reverse() });

    await expect(ctx.subject.invoke(INPUT)).resolves.toMatchObject({ ok: true, data: { status: "cleaned" } });
    expect(ctx.deleteOrder).toEqual(resourceKinds);
    const recorded = ctx.setupRepo.recordCleanupResultOrThrow.mock.calls[0]?.[0];
    expect(recorded).toMatchObject({ setupId: SETUP_ID, completedAt: expect.any(Date) });
    expect(recorded?.decisions.map((decision: AgentWorkspaceSetupCleanupDecision) => decision.kind)).toEqual(
      resourceKinds,
    );
  });

  it("does not persist cleanup completion when a normal domain delete fails", async () => {
    const ctx = setup({ failingDeleteKind: "deal" });

    await expect(ctx.subject.invoke(INPUT)).rejects.toThrow("Could not delete deal");
    expect(ctx.setupRepo.recordCleanupResultOrThrow).not.toHaveBeenCalled();
    expect(ctx.updateCompanySettings.invoke).not.toHaveBeenCalled();
  });

  it("rejects duplicate or substituted cleanup decisions before deleting anything", async () => {
    const duplicate = { ...deleteDecisions[0] } as AgentWorkspaceSetupCleanupDecision;
    const ctx = setup({ cleanup: [duplicate, duplicate] });
    ctx.setupRepo.findAppliedSetupById.mockResolvedValue({
      ...(await ctx.setupRepo.findAppliedSetupById()),
      resources: [
        {
          provenanceId: duplicate.provenanceId,
          kind: duplicate.kind,
          resourceId: duplicate.resourceId,
          initialUpdatedAt: new Date("2026-08-06T08:00:00.000Z"),
          status: "active",
          cleanupReason: null,
        },
        {
          provenanceId: "00000000-0000-4000-8005-000000000001",
          kind: "contact",
          resourceId: "00000000-0000-4000-8006-000000000001",
          initialUpdatedAt: new Date("2026-08-06T08:00:00.000Z"),
          status: "active",
          cleanupReason: null,
        },
      ],
    });

    await expect(ctx.subject.invoke(INPUT)).rejects.toThrow("cleanup plan contains an invalid resource");
    expect(ctx.deleteOrder).toEqual([]);
    expect(ctx.setupRepo.recordCleanupResultOrThrow).not.toHaveBeenCalled();
  });

  it("rejects an incomplete cleanup plan before deleting anything", async () => {
    const ctx = setup();
    ctx.setupRepo.planCleanupOrThrow.mockResolvedValue({
      setupId: SETUP_ID,
      decisions: deleteDecisions.slice(0, -1),
    });

    await expect(ctx.subject.invoke(INPUT)).rejects.toThrow("cleanup plan is incomplete");
    expect(ctx.deleteOrder).toEqual([]);
    expect(ctx.setupRepo.recordCleanupResultOrThrow).not.toHaveBeenCalled();
  });

  it("is idempotent after cleanup", async () => {
    const ctx = setup({ setupStatus: "cleaned", cleanedAt: new Date("2026-08-06T09:00:00.000Z") });

    await expect(ctx.subject.invoke(INPUT)).resolves.toMatchObject({
      ok: true,
      data: { status: "cleaned", deletedResources: 0 },
    });
    expect(ctx.setupRepo.planCleanupOrThrow).not.toHaveBeenCalled();
    expect(ctx.setupRepo.recordCleanupResultOrThrow).not.toHaveBeenCalled();
  });

  it("replays the durable cleanup summary instead of returning empty counts", async () => {
    const ctx = setup({ setupStatus: "cleaned", cleanedAt: new Date("2026-08-06T09:00:00.000Z") });
    const stored = await ctx.setupRepo.findAppliedSetupById();
    ctx.setupRepo.findAppliedSetupById.mockResolvedValue({
      ...stored,
      resources: stored.resources.map((resource: (typeof stored.resources)[number], index: number) => ({
        ...resource,
        status: index === 0 ? "missing" : "deleted",
        cleanupReason: null,
      })),
    });

    await expect(ctx.subject.invoke(INPUT)).resolves.toMatchObject({
      ok: true,
      data: {
        status: "cleaned",
        deletedResources: 19,
        retainedResources: 0,
        missingResources: 1,
        retainedReasons: [],
      },
    });
    expect(ctx.setupRepo.planCleanupOrThrow).not.toHaveBeenCalled();
  });

  it("replays a prior partial safe cleanup without deleting again", async () => {
    const ctx = setup({ setupStatus: "partiallyCleaned", setupRetainedReason: "edited" });

    await expect(ctx.subject.invoke(INPUT)).resolves.toMatchObject({
      ok: true,
      data: {
        status: "partiallyCleaned",
        retainedResources: 20,
        retainedReasons: ["edited"],
      },
    });
    expect(ctx.setupRepo.planCleanupOrThrow).not.toHaveBeenCalled();
    expect(ctx.deleteOrder).toEqual([]);
    expect(ctx.setupRepo.recordCleanupResultOrThrow).not.toHaveBeenCalled();
  });

  it("rejects full cleanup before safe cleanup has retained an edited resource", async () => {
    const ctx = setup();

    await expect(ctx.subject.invoke({ ...INPUT, mode: "full" })).rejects.toThrow(
      "Full cleanup is only available for edited setup resources kept earlier.",
    );
    expect(ctx.setupRepo.planCleanupOrThrow).not.toHaveBeenCalled();
  });

  it("never offers full cleanup for resources retained only because other data depends on them", async () => {
    const ctx = setup({ setupStatus: "partiallyCleaned", setupRetainedReason: "dependent" });

    await expect(ctx.subject.invoke({ ...INPUT, mode: "full" })).resolves.toMatchObject({
      ok: true,
      data: {
        status: "partiallyCleaned",
        retainedResources: 20,
        retainedReasons: ["dependent"],
      },
    });
    expect(ctx.setupRepo.planCleanupOrThrow).not.toHaveBeenCalled();
    expect(ctx.deleteOrder).toEqual([]);
  });
});
