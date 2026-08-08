import { randomUUID } from "node:crypto";

import { AgentMessageRole, TaskType } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { FilterSchema, SavedFilterPresetSchema, SortDescriptorSchema } from "@/core/base/base-get.schema";
import { BULK_WRITE_TRANSACTION, Transaction } from "@/core/decorators/transaction.decorator";
import { AgentSessionUnavailableError } from "@/core/errors/app-errors";
import { EntityTerminologyOverrideSchema } from "@/features/entity-terminology/entity-terminology.schema";

import {
  AGENT_WIDGET_DEPENDENCY_SELECT,
  AGENT_WIDGET_LIVE_RESOURCE_WHERE,
  agentWidgetDependencyConfig,
} from "./agent-widget-dependencies";
import { AgentWorkspaceSetupPlanSchema, hashAgentWorkspaceSetupPlan } from "./agent-workspace-setup";
import {
  AGENT_SETUP_RESOURCE_KINDS,
  type AgentSetupResourceKind,
  type AgentSetupResourceReference,
  type AgentWorkspaceSetupCleanupDecision,
  type AgentWorkspaceSetupCleanupPlan,
  type AgentWorkspaceSetupConversationState,
  type AppliedAgentSetupResource,
  type AppliedAgentWorkspaceSetup,
  type AgentWorkspaceSetupRepo,
} from "./agent-workspace-setup.repository";

type StoredSetupStatus = AppliedAgentWorkspaceSetup["status"];
type StoredResourceStatus = AppliedAgentSetupResource["status"];
type StoredCleanupReason = AppliedAgentSetupResource["cleanupReason"];

type StoredSetupRow = {
  id: string;
  conversationId: string;
  reviewMessageId: string;
  commandId: string;
  plan: unknown;
  planHash: string;
  priorTerminology: unknown;
  status: string;
  appliedAt: Date;
  cleanedAt: Date | null;
};

type StoredResourceRow = {
  id: string;
  setupId: string;
  kind: string;
  resourceId: string;
  initialUpdatedAt: Date;
  status: string;
  cleanupReason: string | null;
};

type LiveResourceRow = { id: string; updatedAt: Date };

type RelationRow = {
  id?: string;
  userId?: string | null;
  contactId?: string | null;
  organizationId?: string | null;
  dealId?: string | null;
  serviceId?: string | null;
  taskId?: string | null;
  widgetId?: string | null;
  columnId?: string | null;
  groupByCustomColumnId?: string | null;
  groupingColumnId?: string | null;
};

type StoredP13nDependencyRow = {
  groupingColumnId: string | null;
  filters: unknown;
  savedFilterPresets: unknown;
  sortDescriptor: unknown;
  columnOrder: string[];
  hiddenColumns: string[];
  columnWidths: unknown;
};

type DependencyEdge = {
  targetKey: string;
  sourceKey: string | null;
};

const SETUP_STATUSES = new Set<StoredSetupStatus>(["applied", "partiallyCleaned", "cleaned"]);
const RESOURCE_STATUSES = new Set<StoredResourceStatus>(["active", "retained", "deleted", "missing"]);
const CLEANUP_REASONS = new Set<Exclude<StoredCleanupReason, null>>(["edited", "dependent"]);
const RESOURCE_KINDS = new Set<string>(AGENT_SETUP_RESOURCE_KINDS);

function resourceKey(kind: AgentSetupResourceKind, resourceId: string) {
  return `${kind}:${resourceId}`;
}

function idsFor(resources: AgentSetupResourceReference[], kind: AgentSetupResourceKind) {
  return resources.filter((resource) => resource.kind === kind).map((resource) => resource.resourceId);
}

function assertDate(value: unknown, description: string): asserts value is Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error(`${description} is invalid.`);
}

function storedSetupStatus(value: string): StoredSetupStatus {
  if (!SETUP_STATUSES.has(value as StoredSetupStatus)) throw new Error("Workspace setup status is invalid.");
  return value as StoredSetupStatus;
}

function storedResourceStatus(value: string): StoredResourceStatus {
  if (!RESOURCE_STATUSES.has(value as StoredResourceStatus))
    throw new Error("Workspace setup resource status is invalid.");
  return value as StoredResourceStatus;
}

function storedCleanupReason(value: string | null): StoredCleanupReason {
  if (value === null) return null;
  if (!CLEANUP_REASONS.has(value as Exclude<StoredCleanupReason, null>))
    throw new Error("Workspace setup cleanup reason is invalid.");
  return value as Exclude<StoredCleanupReason, null>;
}

function storedResourceKind(value: string): AgentSetupResourceKind {
  if (!RESOURCE_KINDS.has(value)) throw new Error("Workspace setup resource kind is invalid.");
  return value as AgentSetupResourceKind;
}

function entityKey(row: RelationRow): string | null {
  if (row.contactId) return resourceKey("contact", row.contactId);
  if (row.organizationId) return resourceKey("organization", row.organizationId);
  if (row.dealId) return resourceKey("deal", row.dealId);
  if (row.serviceId) return resourceKey("service", row.serviceId);
  if (row.taskId) return resourceKey("task", row.taskId);
  return null;
}

function collectJsonReferences(value: unknown, candidates: ReadonlyMap<string, string[]>, description: string) {
  const references = new Set<string>();
  const seen = new WeakSet<object>();

  const visit = (current: unknown) => {
    if (current === null || typeof current === "boolean") return;
    if (typeof current === "string") {
      for (const key of candidates.get(current) ?? []) references.add(key);
      return;
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current)) throw new Error(`${description} is malformed.`);
      return;
    }
    if (Array.isArray(current)) {
      if (seen.has(current)) throw new Error(`${description} is malformed.`);
      seen.add(current);
      current.forEach(visit);
      return;
    }
    if (typeof current === "object") {
      if (seen.has(current)) throw new Error(`${description} is malformed.`);
      seen.add(current);
      for (const [key, item] of Object.entries(current as Record<string, unknown>)) {
        for (const reference of candidates.get(key) ?? []) references.add(reference);
        visit(item);
      }
      return;
    }
    throw new Error(`${description} is malformed.`);
  };

  visit(value);
  return references;
}

function assertFilterJson(value: unknown, description: string) {
  if (value === null) return;
  if (!FilterSchema.array().safeParse(value).success) throw new Error(`${description} is malformed.`);
}

function assertP13nJson(row: StoredP13nDependencyRow) {
  if (row.filters !== null) assertFilterJson(row.filters, "Saved view filters");
  if (row.savedFilterPresets !== null && !SavedFilterPresetSchema.array().safeParse(row.savedFilterPresets).success)
    throw new Error("Saved view presets are malformed.");
  if (row.sortDescriptor !== null && !SortDescriptorSchema.safeParse(row.sortDescriptor).success)
    throw new Error("Saved view sorting is malformed.");
  if (!Array.isArray(row.columnOrder) || !row.columnOrder.every((item) => typeof item === "string"))
    throw new Error("Saved view column order is malformed.");
  if (!Array.isArray(row.hiddenColumns) || !row.hiddenColumns.every((item) => typeof item === "string"))
    throw new Error("Saved view hidden columns are malformed.");
  if (
    row.columnWidths !== null &&
    (!row.columnWidths ||
      typeof row.columnWidths !== "object" ||
      Array.isArray(row.columnWidths) ||
      !Object.values(row.columnWidths as Record<string, unknown>).every(
        (item) => typeof item === "number" && Number.isFinite(item),
      ))
  )
    throw new Error("Saved view column widths are malformed.");
}

function decisionStatus(decision: AgentWorkspaceSetupCleanupDecision): {
  status: StoredResourceStatus;
  cleanupReason: StoredCleanupReason;
} {
  switch (decision.action) {
    case "delete":
      return { status: "deleted", cleanupReason: null };
    case "missing":
      return { status: "missing", cleanupReason: null };
    case "retain":
      return { status: "retained", cleanupReason: decision.reason };
  }
}

export class PrismaAgentWorkspaceSetupRepo extends BaseRepository implements AgentWorkspaceSetupRepo {
  private async mapSetup(row: StoredSetupRow, resourceRows: StoredResourceRow[]): Promise<AppliedAgentWorkspaceSetup> {
    const plan = AgentWorkspaceSetupPlanSchema.safeParse(row.plan);
    if (!plan.success || (await hashAgentWorkspaceSetupPlan(plan.data)) !== row.planHash)
      throw new Error("Stored workspace setup plan is invalid.");

    const priorTerminology = EntityTerminologyOverrideSchema.array().safeParse(row.priorTerminology);
    if (!priorTerminology.success) throw new Error("Stored workspace setup terminology is invalid.");

    assertDate(row.appliedAt, "Workspace setup applied timestamp");
    if (row.cleanedAt !== null) assertDate(row.cleanedAt, "Workspace setup cleaned timestamp");

    const resources = resourceRows.map((resource): AppliedAgentSetupResource => {
      assertDate(resource.initialUpdatedAt, "Workspace setup resource timestamp");
      const status = storedResourceStatus(resource.status);
      const cleanupReason = storedCleanupReason(resource.cleanupReason);
      if ((status === "retained") !== (cleanupReason !== null))
        throw new Error("Stored workspace setup cleanup state is invalid.");

      return {
        provenanceId: resource.id,
        kind: storedResourceKind(resource.kind),
        resourceId: resource.resourceId,
        initialUpdatedAt: resource.initialUpdatedAt,
        status,
        cleanupReason,
      };
    });

    return {
      id: row.id,
      conversationId: row.conversationId,
      reviewMessageId: row.reviewMessageId,
      commandId: row.commandId,
      plan: plan.data,
      planHash: row.planHash,
      priorTerminology: priorTerminology.data,
      status: storedSetupStatus(row.status),
      resources,
      appliedAt: row.appliedAt,
      cleanedAt: row.cleanedAt,
    };
  }

  private async resourcesForSetups(setupIds: string[]) {
    if (setupIds.length === 0) return [];
    return this.prisma.agentWorkspaceSetupResource.findMany({
      where: { companyId: this.companyId, setupId: { in: setupIds } },
      orderBy: [{ setupId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        setupId: true,
        kind: true,
        resourceId: true,
        initialUpdatedAt: true,
        status: true,
        cleanupReason: true,
      },
    });
  }

  private async setupWithResources(row: StoredSetupRow | null) {
    if (!row) return null;
    const resources = await this.resourcesForSetups([row.id]);
    return this.mapSetup(row, resources);
  }

  async findAppliedSetupByReview(args: {
    conversationId: string;
    reviewMessageId: string;
    commandId: string;
    planHash: string;
  }) {
    const row = await this.prisma.agentWorkspaceSetup.findFirst({
      where: {
        companyId: this.companyId,
        userId: this.userId,
        conversationId: args.conversationId,
        conversation: { companyId: this.companyId, userId: this.userId },
        reviewMessageId: args.reviewMessageId,
        commandId: args.commandId,
        planHash: args.planHash,
      },
      select: {
        id: true,
        conversationId: true,
        reviewMessageId: true,
        commandId: true,
        plan: true,
        planHash: true,
        priorTerminology: true,
        status: true,
        appliedAt: true,
        cleanedAt: true,
      },
    });
    return this.setupWithResources(row);
  }

  async findAppliedSetupById(args: { conversationId: string; setupId: string; planHash: string }) {
    const row = await this.prisma.agentWorkspaceSetup.findFirst({
      where: {
        id: args.setupId,
        companyId: this.companyId,
        userId: this.userId,
        conversationId: args.conversationId,
        planHash: args.planHash,
        conversation: { companyId: this.companyId, userId: this.userId },
      },
      select: {
        id: true,
        conversationId: true,
        reviewMessageId: true,
        commandId: true,
        plan: true,
        planHash: true,
        priorTerminology: true,
        status: true,
        appliedAt: true,
        cleanedAt: true,
      },
    });
    return this.setupWithResources(row);
  }

  async listConversationSetupStates(conversationId: string): Promise<AgentWorkspaceSetupConversationState[]> {
    const rows = await this.prisma.agentWorkspaceSetup.findMany({
      where: {
        companyId: this.companyId,
        userId: this.userId,
        conversationId,
        conversation: { companyId: this.companyId, userId: this.userId },
      },
      orderBy: [{ appliedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        conversationId: true,
        reviewMessageId: true,
        commandId: true,
        plan: true,
        planHash: true,
        priorTerminology: true,
        status: true,
        appliedAt: true,
        cleanedAt: true,
      },
    });
    const resourceRows = await this.resourcesForSetups(rows.map((row) => row.id));
    const resourcesBySetup = new Map<string, StoredResourceRow[]>();
    for (const resource of resourceRows) {
      const current = resourcesBySetup.get(resource.setupId) ?? [];
      current.push(resource);
      resourcesBySetup.set(resource.setupId, current);
    }
    const setups = await Promise.all(rows.map((row) => this.mapSetup(row, resourcesBySetup.get(row.id) ?? [])));

    return setups.map((setup) => {
      const cleaned = setup.resources.filter((resource) => resource.status !== "active");
      const retainedReasons = Array.from(
        new Set(
          setup.resources.flatMap((resource) =>
            resource.status === "retained" && resource.cleanupReason ? [resource.cleanupReason] : [],
          ),
        ),
      );
      return {
        setupId: setup.id,
        reviewMessageId: setup.reviewMessageId,
        commandId: setup.commandId,
        planHash: setup.planHash,
        status: setup.status,
        cleanupSummary:
          cleaned.length === 0
            ? null
            : {
                deletedResources: setup.resources.filter((resource) => resource.status === "deleted").length,
                retainedResources: setup.resources.filter((resource) => resource.status === "retained").length,
                missingResources: setup.resources.filter((resource) => resource.status === "missing").length,
                retainedReasons,
              },
      };
    });
  }

  private async reviewStillMatches(args: {
    conversationId: string;
    reviewMessageId: string;
    commandId: string;
    planHash: string;
  }) {
    const conversation = await this.prisma.agentConversation.findFirst({
      where: {
        id: args.conversationId,
        companyId: this.companyId,
        userId: this.userId,
        archivedAt: null,
      },
      select: { id: true },
    });
    if (!conversation) return false;

    const message = await this.prisma.agentMessage.findFirst({
      where: {
        id: args.reviewMessageId,
        conversationId: args.conversationId,
        companyId: this.companyId,
        role: AgentMessageRole.assistant,
      },
      select: { parts: true },
    });
    if (!message || !Array.isArray(message.parts)) return false;

    for (const value of message.parts) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const part = value as Record<string, unknown>;
      if (
        part.type !== "workspace_setup" ||
        part.id !== args.commandId ||
        part.status !== "ready" ||
        part.planHash !== args.planHash
      )
        continue;
      const plan = AgentWorkspaceSetupPlanSchema.safeParse(part.plan);
      if (plan.success && (await hashAgentWorkspaceSetupPlan(plan.data)) === args.planHash) return true;
    }
    return false;
  }

  private async loadLiveResources(resources: AgentSetupResourceReference[]) {
    const companyId = this.companyId;
    const userId = this.userId;
    const select = { id: true, updatedAt: true };
    const [customColumns, organizations, contacts, services, deals, tasks, widgets] = await Promise.all([
      this.prisma.customColumn.findMany({
        where: { companyId, id: { in: idsFor(resources, "customColumn") } },
        select,
      }),
      this.prisma.organization.findMany({
        where: { companyId, id: { in: idsFor(resources, "organization") } },
        select,
      }),
      this.prisma.contact.findMany({
        where: { companyId, id: { in: idsFor(resources, "contact") } },
        select,
      }),
      this.prisma.service.findMany({
        where: { companyId, id: { in: idsFor(resources, "service") } },
        select,
      }),
      this.prisma.deal.findMany({
        where: { companyId, id: { in: idsFor(resources, "deal") } },
        select,
      }),
      this.prisma.task.findMany({
        where: {
          companyId,
          id: { in: idsFor(resources, "task") },
          type: TaskType.custom,
        },
        select,
      }),
      this.prisma.widget.findMany({
        where: {
          companyId,
          userId,
          id: { in: idsFor(resources, "widget") },
          ...AGENT_WIDGET_LIVE_RESOURCE_WHERE,
        },
        select,
      }),
    ]);

    const result = new Map<string, LiveResourceRow>();
    const add = (kind: AgentSetupResourceKind, rows: LiveResourceRow[]) => {
      for (const row of rows) {
        assertDate(row.updatedAt, `${kind} updated timestamp`);
        result.set(resourceKey(kind, row.id), row);
      }
    };
    add("customColumn", customColumns);
    add("organization", organizations);
    add("contact", contacts);
    add("service", services);
    add("deal", deals);
    add("task", tasks);
    add("widget", widgets);
    return result;
  }

  @Transaction(BULK_WRITE_TRANSACTION)
  async recordAppliedSetup(args: Parameters<AgentWorkspaceSetupRepo["recordAppliedSetup"]>[0]) {
    const plan = AgentWorkspaceSetupPlanSchema.safeParse(args.plan);
    if (!plan.success || (await hashAgentWorkspaceSetupPlan(plan.data)) !== args.planHash)
      throw new AgentSessionUnavailableError("Workspace setup plan integrity check failed.");

    const priorTerminology = EntityTerminologyOverrideSchema.array().safeParse(args.priorTerminology);
    if (!priorTerminology.success)
      throw new AgentSessionUnavailableError("Workspace setup terminology snapshot is invalid.");

    const existing = await this.findAppliedSetupByReview({
      conversationId: args.conversationId,
      reviewMessageId: args.reviewMessageId,
      commandId: args.commandId,
      planHash: args.planHash,
    });
    if (existing) return existing;

    const conflicting = await this.prisma.agentWorkspaceSetup.findFirst({
      where: {
        companyId: this.companyId,
        userId: this.userId,
        conversationId: args.conversationId,
        reviewMessageId: args.reviewMessageId,
        commandId: args.commandId,
        conversation: { companyId: this.companyId, userId: this.userId },
      },
      select: {
        id: true,
        conversationId: true,
        reviewMessageId: true,
        commandId: true,
        plan: true,
        planHash: true,
        priorTerminology: true,
        status: true,
        appliedAt: true,
        cleanedAt: true,
      },
    });
    if (conflicting) throw new AgentSessionUnavailableError("This workspace setup review has already been recorded.");

    if (
      !(await this.reviewStillMatches({
        conversationId: args.conversationId,
        reviewMessageId: args.reviewMessageId,
        commandId: args.commandId,
        planHash: args.planHash,
      }))
    )
      throw new AgentSessionUnavailableError("Workspace setup review is no longer available.");

    const uniqueResources = new Set(args.resources.map((item) => resourceKey(item.kind, item.resourceId)));
    if (args.resources.length === 0 || uniqueResources.size !== args.resources.length)
      throw new AgentSessionUnavailableError("Workspace setup resources are incomplete or duplicated.");

    const expectedResourceCounts: Record<AgentSetupResourceKind, number> = {
      customColumn: plan.data.columns.length,
      organization: plan.data.records.organizations.length,
      contact: plan.data.records.contacts.length,
      service: plan.data.records.services.length,
      deal: plan.data.records.deals.length,
      task: plan.data.records.tasks.length,
      widget: plan.data.widgets.length,
    };
    if (AGENT_SETUP_RESOURCE_KINDS.some((kind) => idsFor(args.resources, kind).length !== expectedResourceCounts[kind]))
      throw new AgentSessionUnavailableError("Workspace setup resources do not match the reviewed plan.");

    const liveResources = await this.loadLiveResources(args.resources);
    if (liveResources.size !== args.resources.length)
      throw new AgentSessionUnavailableError("A generated workspace setup resource could not be verified.");

    const setupId = randomUUID();
    const appliedAt = new Date();
    const resources = args.resources.map((item): AppliedAgentSetupResource => {
      const live = liveResources.get(resourceKey(item.kind, item.resourceId));
      if (!live) throw new AgentSessionUnavailableError("A generated workspace setup resource could not be verified.");
      return {
        provenanceId: randomUUID(),
        ...item,
        initialUpdatedAt: live.updatedAt,
        status: "active",
        cleanupReason: null,
      };
    });

    await this.prisma.agentWorkspaceSetup.create({
      data: {
        id: setupId,
        companyId: this.companyId,
        userId: this.userId,
        conversationId: args.conversationId,
        reviewMessageId: args.reviewMessageId,
        commandId: args.commandId,
        plan: plan.data,
        planHash: args.planHash,
        schemaVersion: plan.data.schemaVersion,
        revision: plan.data.revision,
        priorTerminology: priorTerminology.data,
        status: "applied",
        appliedAt,
      },
    });
    const created = await this.prisma.agentWorkspaceSetupResource.createMany({
      data: resources.map((item) => ({
        id: item.provenanceId,
        setupId,
        companyId: this.companyId,
        kind: item.kind,
        resourceId: item.resourceId,
        initialUpdatedAt: item.initialUpdatedAt,
        status: item.status,
        cleanupReason: item.cleanupReason,
      })),
    });
    if (created.count !== resources.length) throw new Error("Workspace setup provenance could not be recorded.");

    return {
      id: setupId,
      conversationId: args.conversationId,
      reviewMessageId: args.reviewMessageId,
      commandId: args.commandId,
      plan: plan.data,
      planHash: args.planHash,
      priorTerminology: priorTerminology.data,
      status: "applied" as const,
      resources,
      appliedAt,
      cleanedAt: null,
    };
  }

  private async dependencyEdges(resources: AppliedAgentSetupResource[]): Promise<DependencyEdge[]> {
    const companyId = this.companyId;
    const organizations = idsFor(resources, "organization");
    const contacts = idsFor(resources, "contact");
    const services = idsFor(resources, "service");
    const deals = idsFor(resources, "deal");
    const tasks = idsFor(resources, "task");
    const columns = idsFor(resources, "customColumn");
    const candidatesById = new Map<string, string[]>();
    for (const resource of resources) {
      const keys = candidatesById.get(resource.resourceId) ?? [];
      keys.push(resourceKey(resource.kind, resource.resourceId));
      candidatesById.set(resource.resourceId, keys);
    }

    const [
      contactOrganizations,
      dealOrganizations,
      taskOrganizations,
      dealContacts,
      taskContacts,
      serviceDeals,
      taskServices,
      taskDeals,
      contactUsers,
      organizationUsers,
      serviceUsers,
      dealUsers,
      taskUsers,
      contactIdentifiers,
      customFieldValues,
      widgets,
      personalizations,
    ] = await Promise.all([
      this.prisma.contactOrganization.findMany({
        where: {
          companyId,
          OR: [{ contactId: { in: contacts } }, { organizationId: { in: organizations } }],
        },
        select: { contactId: true, organizationId: true },
      }),
      this.prisma.dealOrganization.findMany({
        where: {
          companyId,
          OR: [{ dealId: { in: deals } }, { organizationId: { in: organizations } }],
        },
        select: { dealId: true, organizationId: true },
      }),
      this.prisma.taskOrganization.findMany({
        where: {
          companyId,
          OR: [{ taskId: { in: tasks } }, { organizationId: { in: organizations } }],
        },
        select: { taskId: true, organizationId: true },
      }),
      this.prisma.dealContact.findMany({
        where: {
          companyId,
          OR: [{ dealId: { in: deals } }, { contactId: { in: contacts } }],
        },
        select: { dealId: true, contactId: true },
      }),
      this.prisma.taskContact.findMany({
        where: {
          companyId,
          OR: [{ taskId: { in: tasks } }, { contactId: { in: contacts } }],
        },
        select: { taskId: true, contactId: true },
      }),
      this.prisma.serviceDeal.findMany({
        where: {
          companyId,
          OR: [{ serviceId: { in: services } }, { dealId: { in: deals } }],
        },
        select: { dealId: true, serviceId: true },
      }),
      this.prisma.taskService.findMany({
        where: {
          companyId,
          OR: [{ taskId: { in: tasks } }, { serviceId: { in: services } }],
        },
        select: { taskId: true, serviceId: true },
      }),
      this.prisma.taskDeal.findMany({
        where: {
          companyId,
          OR: [{ taskId: { in: tasks } }, { dealId: { in: deals } }],
        },
        select: { taskId: true, dealId: true },
      }),
      this.prisma.contactUser.findMany({
        where: { companyId, contactId: { in: contacts } },
        select: { contactId: true, userId: true },
      }),
      this.prisma.organizationUser.findMany({
        where: { companyId, organizationId: { in: organizations } },
        select: { organizationId: true, userId: true },
      }),
      this.prisma.serviceUser.findMany({
        where: { companyId, serviceId: { in: services } },
        select: { serviceId: true, userId: true },
      }),
      this.prisma.dealUser.findMany({
        where: { companyId, dealId: { in: deals } },
        select: { dealId: true, userId: true },
      }),
      this.prisma.taskUser.findMany({
        where: { companyId, taskId: { in: tasks } },
        select: { taskId: true, userId: true },
      }),
      this.prisma.contactIdentifier.findMany({
        where: { companyId, contactId: { in: contacts } },
        select: { id: true, contactId: true },
      }),
      this.prisma.customFieldValue.findMany({
        where: { companyId, columnId: { in: columns } },
        select: {
          columnId: true,
          contactId: true,
          organizationId: true,
          dealId: true,
          serviceId: true,
          taskId: true,
        },
      }),
      this.prisma.widget.findMany({
        where: { companyId },
        select: AGENT_WIDGET_DEPENDENCY_SELECT,
      }),
      this.prisma.p13n.findMany({
        where: { companyId },
        select: {
          groupingColumnId: true,
          filters: true,
          savedFilterPresets: true,
          sortDescriptor: true,
          columnOrder: true,
          hiddenColumns: true,
          columnWidths: true,
        },
      }),
    ]);

    const edges: DependencyEdge[] = [];
    const addRelationPairs = (
      rows: RelationRow[],
      leftKind: AgentSetupResourceKind,
      leftField: "organizationId" | "contactId" | "serviceId" | "dealId" | "taskId",
      rightKind: AgentSetupResourceKind,
      rightField: "organizationId" | "contactId" | "serviceId" | "dealId" | "taskId",
    ) => {
      for (const row of rows) {
        const leftId = row[leftField];
        const rightId = row[rightField];
        if (leftId) {
          edges.push({
            targetKey: resourceKey(leftKind, leftId),
            sourceKey: rightId ? resourceKey(rightKind, rightId) : null,
          });
        }
        if (rightId) {
          edges.push({
            targetKey: resourceKey(rightKind, rightId),
            sourceKey: leftId ? resourceKey(leftKind, leftId) : null,
          });
        }
      }
    };
    addRelationPairs(contactOrganizations, "contact", "contactId", "organization", "organizationId");
    addRelationPairs(dealOrganizations, "deal", "dealId", "organization", "organizationId");
    addRelationPairs(taskOrganizations, "task", "taskId", "organization", "organizationId");
    addRelationPairs(dealContacts, "deal", "dealId", "contact", "contactId");
    addRelationPairs(taskContacts, "task", "taskId", "contact", "contactId");
    addRelationPairs(serviceDeals, "service", "serviceId", "deal", "dealId");
    addRelationPairs(taskServices, "task", "taskId", "service", "serviceId");
    addRelationPairs(taskDeals, "task", "taskId", "deal", "dealId");

    const addExternalAssignments = (
      rows: RelationRow[],
      kind: AgentSetupResourceKind,
      idField: "contactId" | "organizationId" | "serviceId" | "dealId" | "taskId",
    ) => {
      for (const row of rows) {
        const id = row[idField];
        if (id && row.userId !== this.userId) edges.push({ targetKey: resourceKey(kind, id), sourceKey: null });
      }
    };
    addExternalAssignments(contactUsers, "contact", "contactId");
    addExternalAssignments(organizationUsers, "organization", "organizationId");
    addExternalAssignments(serviceUsers, "service", "serviceId");
    addExternalAssignments(dealUsers, "deal", "dealId");
    addExternalAssignments(taskUsers, "task", "taskId");
    for (const row of contactIdentifiers) {
      if (row.contactId) {
        edges.push({
          targetKey: resourceKey("contact", row.contactId),
          sourceKey: null,
        });
      }
    }

    for (const row of customFieldValues) {
      if (row.columnId) {
        edges.push({
          targetKey: resourceKey("customColumn", row.columnId),
          sourceKey: entityKey(row),
        });
      }
    }
    for (const widget of widgets) {
      assertFilterJson(widget.entityFilters, "Widget entity filters");
      assertFilterJson(widget.dealFilters, "Widget deal filters");

      const sourceKey = resourceKey("widget", widget.id);
      const references = collectJsonReferences(
        agentWidgetDependencyConfig(widget),
        candidatesById,
        "Widget configuration",
      );
      for (const targetKey of references) edges.push({ targetKey, sourceKey });
    }
    for (const row of personalizations) {
      assertP13nJson(row);
      const references = collectJsonReferences(row, candidatesById, "Saved view configuration");
      for (const targetKey of references) edges.push({ targetKey, sourceKey: null });
    }
    return edges;
  }

  async planCleanupOrThrow(args: { setupId: string; mode: "safe" | "full" }): Promise<AgentWorkspaceSetupCleanupPlan> {
    const row = await this.prisma.agentWorkspaceSetup.findFirst({
      where: {
        id: args.setupId,
        companyId: this.companyId,
        userId: this.userId,
        conversation: { companyId: this.companyId, userId: this.userId },
      },
      select: {
        id: true,
        conversationId: true,
        reviewMessageId: true,
        commandId: true,
        plan: true,
        planHash: true,
        priorTerminology: true,
        status: true,
        appliedAt: true,
        cleanedAt: true,
      },
    });
    const setup = await this.setupWithResources(row);
    if (!setup) throw new AgentSessionUnavailableError("Workspace setup not found.");
    if (args.mode === "safe" && setup.status !== "applied")
      throw new AgentSessionUnavailableError("Safe workspace setup cleanup is no longer available.");

    if (args.mode === "full" && setup.status !== "partiallyCleaned")
      throw new AgentSessionUnavailableError("Full workspace setup cleanup is not available.");

    const resources = setup.resources.filter((resource) =>
      args.mode === "safe" ? resource.status === "active" : resource.status === "retained",
    );
    const live = await this.loadLiveResources(resources);
    const liveKeys = new Set(live.keys());
    const retained = new Map<string, "edited" | "dependent">();

    for (const resource of resources) {
      const key = resourceKey(resource.kind, resource.resourceId);
      const current = live.get(key);
      if (!current) continue;
      const shouldRespectEdits = args.mode === "safe" || resource.cleanupReason !== "edited";
      if (shouldRespectEdits && current.updatedAt.getTime() !== resource.initialUpdatedAt.getTime())
        retained.set(key, "edited");
    }

    const edges = await this.dependencyEdges(resources);
    let changed = true;
    while (changed) {
      changed = false;
      for (const edge of edges) {
        if (!liveKeys.has(edge.targetKey) || retained.has(edge.targetKey)) continue;
        if (edge.sourceKey === null || !liveKeys.has(edge.sourceKey) || retained.has(edge.sourceKey)) {
          retained.set(edge.targetKey, "dependent");
          changed = true;
        }
      }
    }

    return {
      setupId: setup.id,
      decisions: resources.map((resource): AgentWorkspaceSetupCleanupDecision => {
        const key = resourceKey(resource.kind, resource.resourceId);
        if (!live.has(key)) {
          return {
            provenanceId: resource.provenanceId,
            kind: resource.kind,
            resourceId: resource.resourceId,
            action: "missing",
            reason: null,
          };
        }
        const reason = retained.get(key);
        if (reason) {
          return {
            provenanceId: resource.provenanceId,
            kind: resource.kind,
            resourceId: resource.resourceId,
            action: "retain",
            reason,
          };
        }
        return {
          provenanceId: resource.provenanceId,
          kind: resource.kind,
          resourceId: resource.resourceId,
          action: "delete",
          reason: null,
        };
      }),
    };
  }

  @Transaction(BULK_WRITE_TRANSACTION)
  async recordCleanupResultOrThrow(args: {
    setupId: string;
    decisions: AgentWorkspaceSetupCleanupDecision[];
    completedAt: Date;
  }) {
    assertDate(args.completedAt, "Workspace setup cleanup timestamp");
    const row = await this.prisma.agentWorkspaceSetup.findFirst({
      where: {
        id: args.setupId,
        companyId: this.companyId,
        userId: this.userId,
        conversation: { companyId: this.companyId, userId: this.userId },
      },
      select: {
        id: true,
        conversationId: true,
        reviewMessageId: true,
        commandId: true,
        plan: true,
        planHash: true,
        priorTerminology: true,
        status: true,
        appliedAt: true,
        cleanedAt: true,
      },
    });
    const setup = await this.setupWithResources(row);
    if (!setup) throw new AgentSessionUnavailableError("Workspace setup not found.");
    if (setup.status === "cleaned")
      throw new AgentSessionUnavailableError("Workspace setup cleanup has already completed.");

    const eligibleStatus: StoredResourceStatus = setup.status === "applied" ? "active" : "retained";
    const eligible = setup.resources.filter((resource) => resource.status === eligibleStatus);
    if (args.decisions.length !== eligible.length)
      throw new AgentSessionUnavailableError("Workspace setup cleanup result is incomplete.");

    const resourceByProvenance = new Map(eligible.map((resource) => [resource.provenanceId, resource]));
    const seen = new Set<string>();
    for (const decision of args.decisions) {
      const resource = resourceByProvenance.get(decision.provenanceId);
      if (
        seen.has(decision.provenanceId) ||
        !resource ||
        resource.kind !== decision.kind ||
        resource.resourceId !== decision.resourceId
      )
        throw new AgentSessionUnavailableError("Workspace setup cleanup result contains an invalid resource.");

      seen.add(decision.provenanceId);
    }

    for (const decision of args.decisions) {
      const state = decisionStatus(decision);
      const updated = await this.prisma.agentWorkspaceSetupResource.updateMany({
        where: {
          id: decision.provenanceId,
          setupId: setup.id,
          companyId: this.companyId,
          kind: decision.kind,
          resourceId: decision.resourceId,
          status: eligibleStatus,
        },
        data: {
          status: state.status,
          cleanupReason: state.cleanupReason,
          resolvedAt: args.completedAt,
        },
      });
      if (updated.count !== 1)
        throw new AgentSessionUnavailableError("Workspace setup cleanup result changed while it was being recorded.");
    }

    const retained = await this.prisma.agentWorkspaceSetupResource.count({
      where: {
        setupId: setup.id,
        companyId: this.companyId,
        status: "retained",
      },
    });
    const nextStatus: StoredSetupStatus = retained > 0 ? "partiallyCleaned" : "cleaned";
    const updatedSetup = await this.prisma.agentWorkspaceSetup.updateMany({
      where: {
        id: setup.id,
        companyId: this.companyId,
        userId: this.userId,
        status: setup.status,
      },
      data: {
        status: nextStatus,
        cleanedAt: nextStatus === "cleaned" ? args.completedAt : null,
      },
    });
    if (updatedSetup.count !== 1)
      throw new AgentSessionUnavailableError("Workspace setup cleanup state changed while it was being recorded.");
  }
}
