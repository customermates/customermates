import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";

const prismaMock = vi.hoisted(() => {
  const findMany = () => ({ findMany: vi.fn() });
  return {
    $transaction: vi.fn(),
    agentConversation: { findFirst: vi.fn() },
    agentMessage: { findFirst: vi.fn() },
    agentWorkspaceSetup: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    agentWorkspaceSetupResource: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    customColumn: findMany(),
    organization: findMany(),
    contact: findMany(),
    service: findMany(),
    deal: findMany(),
    task: findMany(),
    widget: findMany(),
    contactOrganization: findMany(),
    dealOrganization: findMany(),
    taskOrganization: findMany(),
    dealContact: findMany(),
    taskContact: findMany(),
    serviceDeal: findMany(),
    taskService: findMany(),
    taskDeal: findMany(),
    contactUser: findMany(),
    organizationUser: findMany(),
    serviceUser: findMany(),
    dealUser: findMany(),
    taskUser: findMany(),
    contactIdentifier: findMany(),
    customFieldValue: findMany(),
    p13n: findMany(),
  };
});

vi.mock("@/prisma/db", () => ({ prisma: prismaMock }));

import { TaskType } from "@/generated/prisma";

import { runWithTenant } from "@/core/decorators/tenant-context";

import { buildAgentWorkspaceSetupPlan, hashAgentWorkspaceSetupPlan } from "../agent-workspace-setup";
import type { AgentSetupResourceKind, AgentSetupResourceReference } from "../agent-workspace-setup.repository";
import { PrismaAgentWorkspaceSetupRepo } from "../prisma-agent-workspace-setup.repository";

const user = createMockUser();
const conversationId = "00000000-0000-4000-8000-000000000101";
const reviewMessageId = "00000000-0000-4000-8000-000000000102";
const setupId = "00000000-0000-4000-8000-000000000103";
const commandId = "workspace-setup-command";
const initialAt = new Date("2026-08-06T09:00:00.000Z");

const rootDelegates = {
  customColumn: prismaMock.customColumn,
  organization: prismaMock.organization,
  contact: prismaMock.contact,
  service: prismaMock.service,
  deal: prismaMock.deal,
  task: prismaMock.task,
  widget: prismaMock.widget,
} as const;

const dependencyDelegates = [
  prismaMock.contactOrganization,
  prismaMock.dealOrganization,
  prismaMock.taskOrganization,
  prismaMock.dealContact,
  prismaMock.taskContact,
  prismaMock.serviceDeal,
  prismaMock.taskService,
  prismaMock.taskDeal,
  prismaMock.contactUser,
  prismaMock.organizationUser,
  prismaMock.serviceUser,
  prismaMock.dealUser,
  prismaMock.taskUser,
  prismaMock.contactIdentifier,
  prismaMock.customFieldValue,
  prismaMock.p13n,
];

function uuid(value: number) {
  return `00000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;
}

function refs(kind: AgentSetupResourceKind, count: number, offset: number): AgentSetupResourceReference[] {
  return Array.from({ length: count }, (_, index) => ({ kind, resourceId: uuid(offset + index) }));
}

function fullResources(plan: ReturnType<typeof buildAgentWorkspaceSetupPlan>) {
  return [
    ...refs("customColumn", plan.columns.length, 1),
    ...refs("organization", plan.records.organizations.length, 20),
    ...refs("contact", plan.records.contacts.length, 40),
    ...refs("service", plan.records.services.length, 60),
    ...refs("deal", plan.records.deals.length, 80),
    ...refs("task", plan.records.tasks.length, 100),
    ...refs("widget", plan.widgets.length, 120),
  ];
}

function mockLiveResources(
  resources: AgentSetupResourceReference[],
  timestamps: Partial<Record<string, Date>> = {},
  allWidgets: unknown[] = [],
) {
  for (const kind of Object.keys(rootDelegates) as AgentSetupResourceKind[]) {
    const rows = resources
      .filter((resource) => resource.kind === kind)
      .map((resource) => ({
        id: resource.resourceId,
        updatedAt: timestamps[`${kind}:${resource.resourceId}`] ?? initialAt,
      }));
    if (kind === "widget") {
      rootDelegates.widget.findMany.mockImplementation((args: unknown) => {
        const where = (args as { where?: { id?: unknown } }).where;
        return Promise.resolve(where?.id ? rows : allWidgets);
      });
    } else rootDelegates[kind].findMany.mockResolvedValue(rows);
  }
}

function setupRow(
  plan: ReturnType<typeof buildAgentWorkspaceSetupPlan>,
  planHash: string,
  status: "applied" | "partiallyCleaned" | "cleaned" = "applied",
) {
  return {
    id: setupId,
    conversationId,
    reviewMessageId,
    commandId,
    plan,
    planHash,
    priorTerminology: [],
    status,
    appliedAt: initialAt,
    cleanedAt: status === "cleaned" ? new Date("2026-08-06T10:00:00.000Z") : null,
  };
}

function provenanceRows(
  resources: AgentSetupResourceReference[],
  status: "active" | "retained" = "active",
  reason: "edited" | "dependent" | null = null,
) {
  return resources.map((resource, index) => ({
    id: uuid(500 + index),
    setupId,
    kind: resource.kind,
    resourceId: resource.resourceId,
    initialUpdatedAt: initialAt,
    status,
    cleanupReason: reason,
  }));
}

async function planFixture(
  resources: AgentSetupResourceReference[],
  options: {
    status?: "applied" | "partiallyCleaned";
    reason?: "edited" | "dependent";
    timestamps?: Partial<Record<string, Date>>;
    allWidgets?: unknown[];
  } = {},
) {
  const plan = buildAgentWorkspaceSetupPlan({
    useCase: "b2bSales",
    businessName: null,
    goal: null,
  });
  const planHash = await hashAgentWorkspaceSetupPlan(plan);
  prismaMock.agentWorkspaceSetup.findFirst.mockResolvedValue(setupRow(plan, planHash, options.status));
  prismaMock.agentWorkspaceSetupResource.findMany.mockResolvedValue(
    provenanceRows(resources, options.status === "partiallyCleaned" ? "retained" : "active", options.reason ?? null),
  );
  mockLiveResources(resources, options.timestamps, options.allWidgets);
  return { planHash };
}

describe("PrismaAgentWorkspaceSetupRepo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const transactionClient = {
      ...prismaMock,
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      auditLog: { createMany: vi.fn() },
      webhookDelivery: { createMany: vi.fn() },
    };
    prismaMock.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      Promise.resolve(fn(transactionClient)),
    );
    prismaMock.agentWorkspaceSetup.findFirst.mockResolvedValue(null);
    prismaMock.agentWorkspaceSetup.findMany.mockResolvedValue([]);
    prismaMock.agentWorkspaceSetupResource.findMany.mockResolvedValue([]);
    prismaMock.agentWorkspaceSetupResource.createMany.mockResolvedValue({ count: 0 });
    prismaMock.agentWorkspaceSetupResource.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.agentWorkspaceSetupResource.count.mockResolvedValue(0);
    prismaMock.agentWorkspaceSetup.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.agentConversation.findFirst.mockResolvedValue({ id: conversationId });
    for (const delegate of Object.values(rootDelegates)) delegate.findMany.mockResolvedValue([]);
    for (const delegate of dependencyDelegates) delegate.findMany.mockResolvedValue([]);
  });

  it("records authoritative root timestamps for the exact reviewed resource set", async () => {
    const plan = buildAgentWorkspaceSetupPlan({
      useCase: "b2bSales",
      businessName: "Northstar",
      goal: "Set up a sales workspace",
    });
    const planHash = await hashAgentWorkspaceSetupPlan(plan);
    const resources = fullResources(plan);
    const authoritativeAt = new Date("2026-08-06T09:30:00.000Z");
    mockLiveResources(
      resources,
      Object.fromEntries(resources.map((resource) => [`${resource.kind}:${resource.resourceId}`, authoritativeAt])),
    );
    prismaMock.agentMessage.findFirst.mockResolvedValue({
      parts: [{ type: "workspace_setup", id: commandId, status: "ready", plan, planHash }],
    });
    prismaMock.agentWorkspaceSetupResource.createMany.mockResolvedValue({ count: resources.length });

    const result = await runWithTenant(user, () =>
      new PrismaAgentWorkspaceSetupRepo().recordAppliedSetup({
        conversationId,
        reviewMessageId,
        commandId,
        plan,
        planHash,
        priorTerminology: [],
        resources,
      }),
    );

    expect(result.resources).toHaveLength(resources.length);
    expect(result.resources.every((resource) => resource.initialUpdatedAt === authoritativeAt)).toBe(true);
    expect(prismaMock.organization.findMany).toHaveBeenCalledWith({
      where: { companyId: user.companyId, id: { in: refs("organization", 2, 20).map((item) => item.resourceId) } },
      select: { id: true, updatedAt: true },
    });
    expect(prismaMock.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: user.companyId, type: TaskType.custom }),
      }),
    );
    expect(prismaMock.widget.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: user.companyId,
          userId: user.id,
          isTemplate: false,
        }),
      }),
    );
    const created = prismaMock.agentWorkspaceSetupResource.createMany.mock.calls[0]?.[0] as {
      data: Array<{ companyId: string; initialUpdatedAt: Date }>;
    };
    expect(created.data.every((row) => row.companyId === user.companyId)).toBe(true);
    expect(created.data.every((row) => row.initialUpdatedAt === authoritativeAt)).toBe(true);
  });

  it("rolls back provenance when any reviewed resource fails its owner or kind invariant", async () => {
    const plan = buildAgentWorkspaceSetupPlan({ useCase: "b2bSales", businessName: null, goal: null });
    const planHash = await hashAgentWorkspaceSetupPlan(plan);
    const resources = fullResources(plan);
    mockLiveResources(resources);
    prismaMock.widget.findMany.mockResolvedValue([]);
    prismaMock.agentMessage.findFirst.mockResolvedValue({
      parts: [{ type: "workspace_setup", id: commandId, status: "ready", plan, planHash }],
    });

    await expect(
      runWithTenant(user, () =>
        new PrismaAgentWorkspaceSetupRepo().recordAppliedSetup({
          conversationId,
          reviewMessageId,
          commandId,
          plan,
          planHash,
          priorTerminology: [],
          resources,
        }),
      ),
    ).rejects.toThrow("could not be verified");
    expect(prismaMock.agentWorkspaceSetup.create).not.toHaveBeenCalled();
  });

  it("propagates edited retention through the generated relationship graph", async () => {
    const organization = refs("organization", 1, 20)[0];
    const contact = refs("contact", 1, 40)[0];
    const deal = refs("deal", 1, 80)[0];
    const task = refs("task", 1, 100)[0];
    const resources = [organization, contact, deal, task];
    const editedAt = new Date("2026-08-06T10:00:00.000Z");
    await planFixture(resources, { timestamps: { [`task:${task.resourceId}`]: editedAt } });
    prismaMock.taskDeal.findMany.mockResolvedValue([{ taskId: task.resourceId, dealId: deal.resourceId }]);
    prismaMock.dealOrganization.findMany.mockResolvedValue([
      { dealId: deal.resourceId, organizationId: organization.resourceId },
    ]);

    const result = await runWithTenant(user, () =>
      new PrismaAgentWorkspaceSetupRepo().planCleanupOrThrow({ setupId, mode: "safe" }),
    );

    expect(result.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resourceId: task.resourceId, action: "retain", reason: "edited" }),
        expect.objectContaining({ resourceId: deal.resourceId, action: "retain", reason: "dependent" }),
        expect.objectContaining({ resourceId: organization.resourceId, action: "retain", reason: "dependent" }),
        expect.objectContaining({ resourceId: contact.resourceId, action: "delete" }),
      ]),
    );
  });

  it("retains resources with external assignees or authoritative contact identifiers", async () => {
    const organization = refs("organization", 1, 20)[0];
    const contact = refs("contact", 1, 40)[0];
    await planFixture([organization, contact]);
    prismaMock.organizationUser.findMany.mockResolvedValue([
      { organizationId: organization.resourceId, userId: "another-user" },
    ]);
    prismaMock.contactIdentifier.findMany.mockResolvedValue([{ id: uuid(900), contactId: contact.resourceId }]);

    const result = await runWithTenant(user, () =>
      new PrismaAgentWorkspaceSetupRepo().planCleanupOrThrow({ setupId, mode: "safe" }),
    );

    expect(result.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resourceId: organization.resourceId, action: "retain", reason: "dependent" }),
        expect.objectContaining({ resourceId: contact.resourceId, action: "retain", reason: "dependent" }),
      ]),
    );
  });

  it("retains generated records and columns referenced by a surviving widget", async () => {
    const column = refs("customColumn", 1, 1)[0];
    const organization = refs("organization", 1, 20)[0];
    await planFixture([column, organization], {
      allWidgets: [
        {
          id: uuid(950),
          kind: "chart",
          groupByCustomColumnId: null,
          entityFilters: [{ field: column.resourceId, operator: "equals", value: organization.resourceId }],
          dealFilters: [],
          timelineScope: null,
          timelineFilters: null,
        },
      ],
    });

    const result = await runWithTenant(user, () =>
      new PrismaAgentWorkspaceSetupRepo().planCleanupOrThrow({ setupId, mode: "safe" }),
    );

    expect(result.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resourceId: column.resourceId, action: "retain", reason: "dependent" }),
        expect.objectContaining({ resourceId: organization.resourceId, action: "retain", reason: "dependent" }),
      ]),
    );
  });

  it("fails closed instead of deleting around malformed persisted widget configuration", async () => {
    const column = refs("customColumn", 1, 1)[0];
    await planFixture([column], {
      allWidgets: [
        {
          id: uuid(951),
          kind: "chart",
          groupByCustomColumnId: null,
          entityFilters: { field: column.resourceId },
          dealFilters: [],
          timelineScope: null,
          timelineFilters: null,
        },
      ],
    });

    await expect(
      runWithTenant(user, () => new PrismaAgentWorkspaceSetupRepo().planCleanupOrThrow({ setupId, mode: "safe" })),
    ).rejects.toThrow("Widget entity filters is malformed");
  });

  it("full cleanup ignores a prior edit but still preserves current dependencies", async () => {
    const contact = refs("contact", 1, 40)[0];
    const organization = refs("organization", 1, 20)[0];
    const resources = [contact, organization];
    await planFixture(resources, { status: "partiallyCleaned", reason: "edited" });
    prismaMock.contactOrganization.findMany.mockResolvedValue([
      { contactId: contact.resourceId, organizationId: "external-organization" },
    ]);

    const result = await runWithTenant(user, () =>
      new PrismaAgentWorkspaceSetupRepo().planCleanupOrThrow({ setupId, mode: "full" }),
    );

    expect(result.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resourceId: contact.resourceId, action: "retain", reason: "dependent" }),
        expect.objectContaining({ resourceId: organization.resourceId, action: "delete" }),
      ]),
    );
  });

  it("revalidates exact cleanup coverage and tenant scope before recording results", async () => {
    const resources = [refs("contact", 1, 40)[0], refs("organization", 1, 20)[0]];
    const plan = buildAgentWorkspaceSetupPlan({ useCase: "b2bSales", businessName: null, goal: null });
    const planHash = await hashAgentWorkspaceSetupPlan(plan);
    const rows = provenanceRows(resources);
    prismaMock.agentWorkspaceSetup.findFirst.mockResolvedValue(setupRow(plan, planHash));
    prismaMock.agentWorkspaceSetupResource.findMany.mockResolvedValue(rows);
    prismaMock.agentWorkspaceSetupResource.count.mockResolvedValue(1);
    const completedAt = new Date("2026-08-06T11:00:00.000Z");

    await runWithTenant(user, () =>
      new PrismaAgentWorkspaceSetupRepo().recordCleanupResultOrThrow({
        setupId,
        completedAt,
        decisions: [
          {
            provenanceId: rows[0].id,
            kind: "contact",
            resourceId: resources[0].resourceId,
            action: "retain",
            reason: "edited",
          },
          {
            provenanceId: rows[1].id,
            kind: "organization",
            resourceId: resources[1].resourceId,
            action: "delete",
            reason: null,
          },
        ],
      }),
    );

    expect(prismaMock.agentWorkspaceSetupResource.updateMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.agentWorkspaceSetupResource.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: user.companyId, setupId, status: "active" }),
      }),
    );
    expect(prismaMock.agentWorkspaceSetup.updateMany).toHaveBeenCalledWith({
      where: {
        id: setupId,
        companyId: user.companyId,
        userId: user.id,
        status: "applied",
      },
      data: { status: "partiallyCleaned", cleanedAt: null },
    });
  });

  it("rejects duplicate or incomplete cleanup decisions before persistence", async () => {
    const resources = [refs("contact", 1, 40)[0], refs("organization", 1, 20)[0]];
    const plan = buildAgentWorkspaceSetupPlan({ useCase: "b2bSales", businessName: null, goal: null });
    const planHash = await hashAgentWorkspaceSetupPlan(plan);
    const rows = provenanceRows(resources);
    prismaMock.agentWorkspaceSetup.findFirst.mockResolvedValue(setupRow(plan, planHash));
    prismaMock.agentWorkspaceSetupResource.findMany.mockResolvedValue(rows);
    const decision = {
      provenanceId: rows[0].id,
      kind: "contact" as const,
      resourceId: resources[0].resourceId,
      action: "delete" as const,
      reason: null,
    };

    await expect(
      runWithTenant(user, () =>
        new PrismaAgentWorkspaceSetupRepo().recordCleanupResultOrThrow({
          setupId,
          completedAt: new Date(),
          decisions: [decision, decision],
        }),
      ),
    ).rejects.toThrow("invalid resource");
    expect(prismaMock.agentWorkspaceSetupResource.updateMany).not.toHaveBeenCalled();
  });

  it("summarizes durable cleanup state for conversation overlays", async () => {
    const plan = buildAgentWorkspaceSetupPlan({ useCase: "b2bSales", businessName: null, goal: null });
    const planHash = await hashAgentWorkspaceSetupPlan(plan);
    const resources = [refs("contact", 1, 40)[0], refs("organization", 1, 20)[0], refs("task", 1, 100)[0]];
    prismaMock.agentWorkspaceSetup.findMany.mockResolvedValue([setupRow(plan, planHash, "partiallyCleaned")]);
    prismaMock.agentWorkspaceSetupResource.findMany.mockResolvedValue([
      { ...provenanceRows([resources[0]])[0], status: "deleted", cleanupReason: null },
      { ...provenanceRows([resources[1]])[0], id: uuid(700), status: "retained", cleanupReason: "dependent" },
      { ...provenanceRows([resources[2]])[0], id: uuid(701), status: "missing", cleanupReason: null },
    ]);

    const states = await runWithTenant(user, () =>
      new PrismaAgentWorkspaceSetupRepo().listConversationSetupStates(conversationId),
    );

    expect(states).toEqual([
      expect.objectContaining({
        setupId,
        reviewMessageId,
        commandId,
        planHash,
        status: "partiallyCleaned",
        cleanupSummary: {
          deletedResources: 1,
          retainedResources: 1,
          missingResources: 1,
          retainedReasons: ["dependent"],
        },
      }),
    ]);
  });
});
