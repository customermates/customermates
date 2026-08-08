import { randomUUID } from "node:crypto";

import { z } from "zod";
import { Action, AggregationType, CustomColumnType, EntityType, Resource, WidgetGroupByType } from "@/generated/prisma";

import type { GetCompanySettingsInteractor } from "@/features/company/get-company-settings.interactor";
import type { UpdateCompanySettingsInteractor } from "@/features/company/update-company-settings.interactor";
import type { UpsertCustomColumnInteractor } from "@/features/custom-column/upsert-custom-column.interactor";
import type { CreateManyContactsInteractor } from "@/features/contacts/upsert/create-many-contacts.interactor";
import type { CreateManyOrganizationsInteractor } from "@/features/organizations/upsert/create-many-organizations.interactor";
import type { CreateManyDealsInteractor } from "@/features/deals/upsert/create-many-deals.interactor";
import type { CreateManyServicesInteractor } from "@/features/services/upsert/create-many-services.interactor";
import type { CreateManyTasksInteractor } from "@/features/tasks/upsert/create-many-tasks.interactor";
import type { UpsertWidgetInteractor } from "@/features/widget/upsert-widget.interactor";
import type { Validated } from "@/core/validation/validation.utils";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { getTenantUser } from "@/core/decorators/tenant-context";
import { BULK_WRITE_TRANSACTION, Transaction } from "@/core/decorators/transaction.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { AgentSessionUnavailableError } from "@/core/errors/app-errors";
import { CHIP_COLORS } from "@/constants/chip-colors";
import { DisplayType } from "@/features/widget/widget.schema";

import {
  agentWorkspaceSetupCounts,
  agentWorkspaceSetupTerminologyEntries,
  type AgentSetupColumnPlan,
} from "./agent-workspace-setup";
import type {
  AgentSetupResourceKind,
  AgentSetupResourceReference,
  AgentWorkspaceSetupRepo,
} from "./agent-workspace-setup.repository";
import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";

export const ApplyAgentWorkspaceSetupSchema = z.object({
  conversationId: z.uuid(),
  commandId: z.string().min(1).max(200),
  planHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export type ApplyAgentWorkspaceSetupData = z.infer<typeof ApplyAgentWorkspaceSetupSchema>;

export type ApplyAgentWorkspaceSetupResult = {
  status: "applied" | "alreadyApplied" | "notEmpty";
  setupId: string | null;
  counts: ReturnType<typeof agentWorkspaceSetupCounts>;
};

type RuntimeColumn = {
  plan: AgentSetupColumnPlan;
  id: string;
  optionIds: string[];
};

type SetupDependencies = {
  chatRepo: PrismaAgentChatRepo;
  setupRepo: AgentWorkspaceSetupRepo;
  getCompanySettings: GetCompanySettingsInteractor;
  updateCompanySettings: UpdateCompanySettingsInteractor;
  upsertCustomColumn: UpsertCustomColumnInteractor;
  createOrganizations: CreateManyOrganizationsInteractor;
  createContacts: CreateManyContactsInteractor;
  createServices: CreateManyServicesInteractor;
  createDeals: CreateManyDealsInteractor;
  createTasks: CreateManyTasksInteractor;
  upsertWidget: UpsertWidgetInteractor;
};

async function dataOrThrow<T>(resultPromise: Validated<T>): Promise<T> {
  const result = await resultPromise;
  if (!result.ok) throw result.error;
  return result.data;
}

function resource(kind: AgentSetupResourceKind, value: { id: string }): AgentSetupResourceReference {
  return {
    kind,
    resourceId: value.id,
  };
}

function entityType(value: AgentSetupColumnPlan["entityType"]): EntityType {
  return EntityType[value];
}

function itemAt<T>(items: readonly T[], index: number, description: string): T {
  const item = items[index];
  if (item === undefined) throw new Error(`Workspace setup ${description} is missing.`);
  return item;
}

function fieldValuesFor(
  columns: RuntimeColumn[],
  target: AgentSetupColumnPlan["entityType"],
  index: number,
  now: Date,
  dueInDays = (index + 1) * 3,
) {
  return columns.flatMap((column) => {
    if (column.plan.entityType !== target) return [];

    if (column.plan.type === "date") {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dueInDays));
      return [{ columnId: column.id, value: date.toISOString().slice(0, 10) }];
    }

    const optionId = column.optionIds[index % column.optionIds.length];
    return optionId ? [{ columnId: column.id, value: optionId }] : [];
  });
}

@TenantInteractor({
  permissions: [
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
  ],
  condition: "AND",
})
export class ApplyAgentWorkspaceSetupInteractor extends AuthenticatedInteractor<
  ApplyAgentWorkspaceSetupData,
  ApplyAgentWorkspaceSetupResult
> {
  constructor(private deps: SetupDependencies) {
    super();
  }

  @Validate(ApplyAgentWorkspaceSetupSchema)
  @Transaction(BULK_WRITE_TRANSACTION)
  async invoke(data: ApplyAgentWorkspaceSetupData): Validated<ApplyAgentWorkspaceSetupResult> {
    const conversation = await this.deps.chatRepo.findConversation(data.conversationId);
    if (!conversation) throw new AgentSessionUnavailableError("Conversation not found.");

    const reviewed = await this.deps.chatRepo.findReviewedWorkspaceSetup({
      conversationId: data.conversationId,
      commandId: data.commandId,
    });
    if (!reviewed) throw new AgentSessionUnavailableError("Workspace setup review not found.");
    if (reviewed.planHash !== data.planHash) {
      throw new AgentSessionUnavailableError(
        "Workspace setup review has changed. Review the current plan before applying it.",
      );
    }

    const plan = reviewed.plan;
    const counts = agentWorkspaceSetupCounts(plan);
    const existing = await this.deps.setupRepo.findAppliedSetupByReview({
      conversationId: data.conversationId,
      reviewMessageId: reviewed.reviewMessageId,
      commandId: data.commandId,
      planHash: reviewed.planHash,
    });
    if (existing) {
      return {
        ok: true,
        data: { status: "alreadyApplied", setupId: existing.id, counts },
      };
    }

    const signals = await this.deps.chatRepo.getWorkspaceSetupSignals();
    if (signals.contacts || signals.organizations || signals.deals || signals.services || signals.tasks)
      return { ok: true, data: { status: "notEmpty", setupId: null, counts } };

    const user = getTenantUser();
    const settings = await dataOrThrow(this.deps.getCompanySettings.invoke());
    const priorTerminology = settings.terminology.presets;
    const resources: AgentSetupResourceReference[] = [];

    await dataOrThrow(
      this.deps.updateCompanySettings.invoke({
        terminology: agentWorkspaceSetupTerminologyEntries(plan),
      }),
    );

    const columns: RuntimeColumn[] = [];
    for (const columnPlan of plan.columns) {
      const optionIds = columnPlan.options.map(() => randomUUID());
      const column = await dataOrThrow(
        this.deps.upsertCustomColumn.invoke(
          columnPlan.type === "date"
            ? {
                label: columnPlan.label,
                entityType: entityType(columnPlan.entityType),
                type: CustomColumnType.date,
                options: { displayFormat: "descriptiveShort" },
              }
            : {
                label: columnPlan.label,
                entityType: entityType(columnPlan.entityType),
                type: CustomColumnType.singleSelect,
                options: {
                  options: columnPlan.options.map((label, index) => ({
                    value: itemAt(optionIds, index, "column option"),
                    label,
                    color: itemAt(CHIP_COLORS, index % CHIP_COLORS.length, "column color"),
                    isDefault: false,
                    index,
                  })),
                },
              },
        ),
      );
      columns.push({ plan: columnPlan, id: column.id, optionIds });
      resources.push(resource("customColumn", column));
    }

    const now = new Date();
    const organizations = await dataOrThrow(
      this.deps.createOrganizations.invoke({
        organizations: plan.records.organizations.map((name) => ({
          name,
          contactIds: [],
          userIds: [user.id],
          dealIds: [],
          taskIds: [],
          customFieldValues: [],
        })),
      }),
    );
    organizations.forEach((item) => resources.push(resource("organization", item)));

    const contacts = await dataOrThrow(
      this.deps.createContacts.invoke({
        contacts: plan.records.contacts.map((contact, index) => ({
          firstName: contact.firstName,
          lastName: contact.lastName,
          organizationIds: [itemAt(organizations, contact.organizationIndex, "contact organization").id],
          userIds: [user.id],
          dealIds: [],
          taskIds: [],
          customFieldValues: fieldValuesFor(columns, "contact", index, now),
        })),
      }),
    );
    contacts.forEach((item) => resources.push(resource("contact", item)));

    const services = await dataOrThrow(
      this.deps.createServices.invoke({
        services: plan.records.services.map((service, index) => ({
          name: service.name,
          amount: service.amount,
          userIds: [user.id],
          dealIds: [],
          taskIds: [],
          customFieldValues: fieldValuesFor(columns, "service", index, now),
        })),
      }),
    );
    services.forEach((item) => resources.push(resource("service", item)));

    const deals = await dataOrThrow(
      this.deps.createDeals.invoke({
        deals: plan.records.deals.map((deal, index) => ({
          name: deal.name,
          organizationIds: [itemAt(organizations, deal.organizationIndex, "deal organization").id],
          contactIds: deal.contactIndexes.map((contactIndex) => itemAt(contacts, contactIndex, "deal contact").id),
          services: [
            {
              serviceId: itemAt(services, deal.serviceIndex, "deal service").id,
              quantity: 1,
            },
          ],
          userIds: [user.id],
          taskIds: [],
          customFieldValues: fieldValuesFor(columns, "deal", index, now),
        })),
      }),
    );
    deals.forEach((item) => resources.push(resource("deal", item)));

    const tasks = await dataOrThrow(
      this.deps.createTasks.invoke({
        tasks: plan.records.tasks.map((task, index) => {
          const dealPlan = itemAt(plan.records.deals, task.dealIndex, "task deal plan");
          return {
            name: task.name,
            contactIds: dealPlan.contactIndexes.map(
              (contactIndex) => itemAt(contacts, contactIndex, "task contact").id,
            ),
            organizationIds: [itemAt(organizations, dealPlan.organizationIndex, "task organization").id],
            dealIds: [itemAt(deals, task.dealIndex, "task deal").id],
            serviceIds: [itemAt(services, dealPlan.serviceIndex, "task service").id],
            userIds: [user.id],
            customFieldValues: fieldValuesFor(columns, "task", index, now, task.dueInDays),
          };
        }),
      }),
    );
    tasks.forEach((item) => resources.push(resource("task", item)));

    for (const widgetPlan of plan.widgets) {
      const groupColumn = columns.find((column) => column.plan.semanticKey === widgetPlan.groupByColumnSemanticKey);
      if (!groupColumn) throw new Error(`Workspace setup column ${widgetPlan.groupByColumnSemanticKey} is missing.`);

      const widget = await dataOrThrow(
        this.deps.upsertWidget.invoke({
          name: widgetPlan.name,
          entityType: EntityType[widgetPlan.entityType],
          entityFilters: [],
          dealFilters: [],
          displayOptions: {
            displayType: DisplayType[widgetPlan.display],
            showLegend: widgetPlan.display === "doughnutChart",
            showFilters: true,
          },
          groupByType: WidgetGroupByType.customColumn,
          groupByCustomColumnId: groupColumn.id,
          aggregationType: widgetPlan.aggregation === "dealValue" ? AggregationType.dealValue : AggregationType.count,
          isTemplate: false,
        }),
      );
      resources.push(resource("widget", widget));
    }

    const setup = await this.deps.setupRepo.recordAppliedSetup({
      conversationId: data.conversationId,
      reviewMessageId: reviewed.reviewMessageId,
      commandId: data.commandId,
      plan,
      planHash: reviewed.planHash,
      priorTerminology,
      resources,
    });

    return { ok: true, data: { status: "applied", setupId: setup.id, counts } };
  }
}
