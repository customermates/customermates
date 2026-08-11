import { z } from "zod";
import { EntityType } from "@/generated/prisma";

import { sanitizeAgentVisibleText } from "./agent-output-safety";
import type { AgentTranslator } from "./agent-translator";

function visibleText(max: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(max)
    .transform((value) => sanitizeAgentVisibleText(value).trim())
    .refine(Boolean, "Visible text is required.");
}

export const AGENT_WORKSPACE_USE_CASES = [
  "b2bSales",
  "clientProjects",
  "productSales",
  "relationshipManagement",
  "custom",
] as const;

export const AgentWorkspaceUseCaseSchema = z.enum(AGENT_WORKSPACE_USE_CASES);
export type AgentWorkspaceUseCase = z.infer<typeof AgentWorkspaceUseCaseSchema>;

const AgentWorkspaceTerminologyInputSchema = z.object({
  contact: z.enum(["contact", "person", "client"]),
  organization: z.enum(["organization", "company", "account"]),
  deal: z.enum(["deal", "opportunity", "project"]),
  service: z.enum(["service", "product", "offering"]),
});

const AgentWorkspaceCustomFieldInputSchema = z
  .object({
    entityType: z.enum(["contact", "organization", "deal", "service", "task"]),
    label: visibleText(80),
    type: z.enum(["date", "singleSelect"]),
    options: z.array(visibleText(80)).max(8),
  })
  .superRefine((field, ctx) => {
    if (field.type === "singleSelect" && field.options.length < 2) {
      ctx.addIssue({
        code: "custom",
        message: "A select field needs at least two options.",
        path: ["options"],
      });
    }
    if (field.type === "date" && field.options.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: "A date field cannot have options.",
        path: ["options"],
      });
    }
  });

export const PrepareAgentWorkspaceSetupSchema = z.object({
  useCase: AgentWorkspaceUseCaseSchema,
  businessName: visibleText(80).nullable(),
  goal: visibleText(500).nullable(),
  terminology: AgentWorkspaceTerminologyInputSchema.optional(),
  customFields: z.array(AgentWorkspaceCustomFieldInputSchema).max(2).optional(),
});

export type PrepareAgentWorkspaceSetupData = z.infer<typeof PrepareAgentWorkspaceSetupSchema>;

const AgentSetupColumnPlanSchema = z.object({
  semanticKey: z.string().min(1).max(100),
  entityType: z.enum(["contact", "organization", "deal", "service", "task"]),
  label: visibleText(255),
  type: z.enum(["date", "singleSelect"]),
  options: z.array(visibleText(255)).max(20),
});

const AgentSetupRecordPlanSchema = z.object({
  organizations: z.array(visibleText(255)).max(10),
  contacts: z
    .array(
      z.object({
        firstName: visibleText(255),
        lastName: z
          .string()
          .max(255)
          .transform((value) => sanitizeAgentVisibleText(value).trim()),
        organizationIndex: z.number().int().min(0),
      }),
    )
    .max(20),
  services: z
    .array(
      z.object({
        name: visibleText(255),
        amount: z.number().positive(),
      }),
    )
    .max(10),
  deals: z
    .array(
      z.object({
        name: visibleText(255),
        organizationIndex: z.number().int().min(0),
        contactIndexes: z.array(z.number().int().min(0)).min(1).max(10),
        serviceIndex: z.number().int().min(0),
      }),
    )
    .max(20),
  tasks: z
    .array(
      z.object({
        name: visibleText(255),
        dealIndex: z.number().int().min(0),
        dueInDays: z.number().int().min(1).max(90),
      }),
    )
    .max(20),
});

const AgentSetupWidgetPlanSchema = z.object({
  semanticKey: z.string().min(1).max(100),
  name: visibleText(255),
  entityType: z.enum(["deal", "task"]),
  aggregation: z.enum(["count", "dealValue"]),
  groupByColumnSemanticKey: z.string().min(1).max(100),
  display: z.enum(["verticalBarChart", "doughnutChart"]),
});

export type AgentSetupColumnPlan = {
  semanticKey: string;
  entityType: "contact" | "organization" | "deal" | "service" | "task";
  label: string;
  type: "date" | "singleSelect";
  options: string[];
};

export type AgentSetupRecordPlan = {
  organizations: string[];
  contacts: {
    firstName: string;
    lastName: string;
    organizationIndex: number;
  }[];
  services: { name: string; amount: number }[];
  deals: {
    name: string;
    organizationIndex: number;
    contactIndexes: number[];
    serviceIndex: number;
  }[];
  tasks: { name: string; dealIndex: number; dueInDays: number }[];
};

export type AgentSetupWidgetPlan = {
  semanticKey: string;
  name: string;
  entityType: "deal" | "task";
  aggregation: "count" | "dealValue";
  groupByColumnSemanticKey: string;
  display: "verticalBarChart" | "doughnutChart";
};

export type AgentWorkspaceSetupPlan = {
  schemaVersion: 1;
  revision: 1;
  useCase: AgentWorkspaceUseCase;
  businessName: string | null;
  goal: string | null;
  terminology: {
    contact: "contact" | "person" | "client";
    organization: "organization" | "company" | "account";
    deal: "deal" | "opportunity" | "project";
    service: "service" | "product" | "offering";
  };
  columns: AgentSetupColumnPlan[];
  records: AgentSetupRecordPlan;
  widgets: AgentSetupWidgetPlan[];
};

export const AgentWorkspaceSetupPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.literal(1),
    useCase: AgentWorkspaceUseCaseSchema,
    businessName: visibleText(80).nullable(),
    goal: visibleText(500).nullable(),
    terminology: z.object({
      contact: z.enum(["contact", "person", "client"]),
      organization: z.enum(["organization", "company", "account"]),
      deal: z.enum(["deal", "opportunity", "project"]),
      service: z.enum(["service", "product", "offering"]),
    }),
    columns: z.array(AgentSetupColumnPlanSchema).min(3).max(5),
    records: AgentSetupRecordPlanSchema,
    widgets: z.array(AgentSetupWidgetPlanSchema).min(1).max(5),
  })
  .superRefine((plan, ctx) => {
    const semanticKeys = plan.columns.map((column) => column.semanticKey);
    if (new Set(semanticKeys).size !== semanticKeys.length) {
      ctx.addIssue({
        code: "custom",
        message: "Workspace setup field keys must be unique.",
        path: ["columns"],
      });
    }

    plan.records.contacts.forEach((contact, index) => {
      if (!plan.records.organizations[contact.organizationIndex]) {
        ctx.addIssue({
          code: "custom",
          message: "Contact organization reference is invalid.",
          path: ["records", "contacts", index, "organizationIndex"],
        });
      }
    });
    plan.records.deals.forEach((deal, index) => {
      if (!plan.records.organizations[deal.organizationIndex]) {
        ctx.addIssue({
          code: "custom",
          message: "Deal organization reference is invalid.",
          path: ["records", "deals", index, "organizationIndex"],
        });
      }
      if (!plan.records.services[deal.serviceIndex]) {
        ctx.addIssue({
          code: "custom",
          message: "Deal service reference is invalid.",
          path: ["records", "deals", index, "serviceIndex"],
        });
      }
      deal.contactIndexes.forEach((contactIndex, contactPosition) => {
        if (!plan.records.contacts[contactIndex]) {
          ctx.addIssue({
            code: "custom",
            message: "Deal contact reference is invalid.",
            path: ["records", "deals", index, "contactIndexes", contactPosition],
          });
        }
      });
    });
    plan.records.tasks.forEach((task, index) => {
      if (!plan.records.deals[task.dealIndex]) {
        ctx.addIssue({
          code: "custom",
          message: "Task deal reference is invalid.",
          path: ["records", "tasks", index, "dealIndex"],
        });
      }
    });
    plan.widgets.forEach((widget, index) => {
      const groupColumn = plan.columns.find((column) => column.semanticKey === widget.groupByColumnSemanticKey);
      if (!groupColumn || groupColumn.entityType !== widget.entityType || groupColumn.type !== "singleSelect") {
        ctx.addIssue({
          code: "custom",
          message: "Widget grouping field is invalid.",
          path: ["widgets", index, "groupByColumnSemanticKey"],
        });
      }
    });
  });

const SHARED_COLUMNS: AgentSetupColumnPlan[] = [
  {
    semanticKey: "deal-stage",
    entityType: "deal",
    label: "Stage",
    type: "singleSelect",
    options: ["New", "Qualified", "Proposal", "Won"],
  },
  {
    semanticKey: "task-status",
    entityType: "task",
    label: "Status",
    type: "singleSelect",
    options: ["To do", "In progress", "Done"],
  },
  {
    semanticKey: "task-due-date",
    entityType: "task",
    label: "Due date",
    type: "date",
    options: [],
  },
];

const SHARED_WIDGETS: AgentSetupWidgetPlan[] = [
  {
    semanticKey: "pipeline-value-by-stage",
    name: "Pipeline value by stage",
    entityType: "deal",
    aggregation: "dealValue",
    groupByColumnSemanticKey: "deal-stage",
    display: "verticalBarChart",
  },
  {
    semanticKey: "deals-by-stage",
    name: "Deals by stage",
    entityType: "deal",
    aggregation: "count",
    groupByColumnSemanticKey: "deal-stage",
    display: "doughnutChart",
  },
  {
    semanticKey: "tasks-by-status",
    name: "Tasks by status",
    entityType: "task",
    aggregation: "count",
    groupByColumnSemanticKey: "task-status",
    display: "verticalBarChart",
  },
];

const RECORDS: Record<AgentWorkspaceUseCase, AgentSetupRecordPlan> = {
  b2bSales: {
    organizations: ["Northstar Analytics", "Linden Works"],
    contacts: [
      { firstName: "Maya", lastName: "Chen", organizationIndex: 0 },
      { firstName: "Noah", lastName: "Williams", organizationIndex: 0 },
      { firstName: "Sofia", lastName: "Keller", organizationIndex: 1 },
    ],
    services: [
      { name: "Discovery workshop", amount: 1800 },
      { name: "Growth rollout", amount: 9200 },
    ],
    deals: [
      {
        name: "Northstar pilot",
        organizationIndex: 0,
        contactIndexes: [0],
        serviceIndex: 0,
      },
      {
        name: "Northstar rollout",
        organizationIndex: 0,
        contactIndexes: [0, 1],
        serviceIndex: 1,
      },
      {
        name: "Linden expansion",
        organizationIndex: 1,
        contactIndexes: [2],
        serviceIndex: 1,
      },
    ],
    tasks: [
      { name: "Confirm discovery goals", dealIndex: 0, dueInDays: 3 },
      { name: "Prepare rollout proposal", dealIndex: 1, dueInDays: 6 },
      { name: "Schedule stakeholder review", dealIndex: 2, dueInDays: 9 },
    ],
  },
  clientProjects: {
    organizations: ["Juniper Studio", "Brightpath Foundation"],
    contacts: [
      { firstName: "Amira", lastName: "Patel", organizationIndex: 0 },
      { firstName: "Leo", lastName: "Martin", organizationIndex: 0 },
      { firstName: "Hannah", lastName: "Schulz", organizationIndex: 1 },
    ],
    services: [
      { name: "Strategy sprint", amount: 3200 },
      { name: "Implementation project", amount: 12500 },
    ],
    deals: [
      {
        name: "Juniper discovery",
        organizationIndex: 0,
        contactIndexes: [0],
        serviceIndex: 0,
      },
      {
        name: "Juniper implementation",
        organizationIndex: 0,
        contactIndexes: [0, 1],
        serviceIndex: 1,
      },
      {
        name: "Brightpath relaunch",
        organizationIndex: 1,
        contactIndexes: [2],
        serviceIndex: 1,
      },
    ],
    tasks: [
      { name: "Collect project requirements", dealIndex: 0, dueInDays: 3 },
      { name: "Review delivery plan", dealIndex: 1, dueInDays: 6 },
      { name: "Book project kickoff", dealIndex: 2, dueInDays: 9 },
    ],
  },
  productSales: {
    organizations: ["Oak & Field", "Solaris Market"],
    contacts: [
      { firstName: "Elias", lastName: "Brown", organizationIndex: 0 },
      { firstName: "Nina", lastName: "Fischer", organizationIndex: 0 },
      { firstName: "Lucas", lastName: "Reed", organizationIndex: 1 },
    ],
    services: [
      { name: "Team plan", amount: 2400 },
      { name: "Enterprise plan", amount: 9800 },
    ],
    deals: [
      {
        name: "Oak & Field team plan",
        organizationIndex: 0,
        contactIndexes: [0],
        serviceIndex: 0,
      },
      {
        name: "Oak & Field expansion",
        organizationIndex: 0,
        contactIndexes: [0, 1],
        serviceIndex: 1,
      },
      {
        name: "Solaris enterprise plan",
        organizationIndex: 1,
        contactIndexes: [2],
        serviceIndex: 1,
      },
    ],
    tasks: [
      { name: "Confirm seat requirements", dealIndex: 0, dueInDays: 3 },
      { name: "Share security package", dealIndex: 1, dueInDays: 6 },
      { name: "Prepare product demo", dealIndex: 2, dueInDays: 9 },
    ],
  },
  relationshipManagement: {
    organizations: ["Cedar Network", "Common Ground"],
    contacts: [
      { firstName: "Ava", lastName: "Kim", organizationIndex: 0 },
      { firstName: "Jonas", lastName: "Weber", organizationIndex: 0 },
      { firstName: "Ella", lastName: "Robinson", organizationIndex: 1 },
    ],
    services: [
      { name: "Advisory session", amount: 750 },
      { name: "Partnership program", amount: 3600 },
    ],
    deals: [
      {
        name: "Cedar introduction",
        organizationIndex: 0,
        contactIndexes: [0],
        serviceIndex: 0,
      },
      {
        name: "Cedar partnership",
        organizationIndex: 0,
        contactIndexes: [0, 1],
        serviceIndex: 1,
      },
      {
        name: "Common Ground advisory",
        organizationIndex: 1,
        contactIndexes: [2],
        serviceIndex: 0,
      },
    ],
    tasks: [
      { name: "Send introduction note", dealIndex: 0, dueInDays: 3 },
      { name: "Draft partnership outline", dealIndex: 1, dueInDays: 6 },
      { name: "Schedule a check-in", dealIndex: 2, dueInDays: 9 },
    ],
  },
  custom: {
    organizations: ["Example Partner", "Example Customer"],
    contacts: [
      { firstName: "Alex", lastName: "Morgan", organizationIndex: 0 },
      { firstName: "Priya", lastName: "Shah", organizationIndex: 0 },
      { firstName: "Sam", lastName: "Taylor", organizationIndex: 1 },
    ],
    services: [
      { name: "Core offering", amount: 1500 },
      { name: "Expanded offering", amount: 6000 },
    ],
    deals: [
      {
        name: "Partner opportunity",
        organizationIndex: 0,
        contactIndexes: [0],
        serviceIndex: 0,
      },
      {
        name: "Partner expansion",
        organizationIndex: 0,
        contactIndexes: [0, 1],
        serviceIndex: 1,
      },
      {
        name: "Customer opportunity",
        organizationIndex: 1,
        contactIndexes: [2],
        serviceIndex: 1,
      },
    ],
    tasks: [
      { name: "Clarify requirements", dealIndex: 0, dueInDays: 3 },
      { name: "Prepare the next step", dealIndex: 1, dueInDays: 6 },
      { name: "Schedule a follow-up", dealIndex: 2, dueInDays: 9 },
    ],
  },
};

const TEMPLATE_COLUMNS: Record<AgentWorkspaceUseCase, AgentSetupColumnPlan | null> = {
  b2bSales: {
    semanticKey: "deal-source",
    entityType: "deal",
    label: "Source",
    type: "singleSelect",
    options: ["Referral", "Inbound", "Outbound"],
  },
  clientProjects: {
    semanticKey: "deal-health",
    entityType: "deal",
    label: "Project health",
    type: "singleSelect",
    options: ["On track", "At risk", "Blocked"],
  },
  productSales: {
    semanticKey: "contact-segment",
    entityType: "contact",
    label: "Segment",
    type: "singleSelect",
    options: ["Small team", "Mid-market", "Enterprise"],
  },
  relationshipManagement: {
    semanticKey: "contact-relationship",
    entityType: "contact",
    label: "Relationship",
    type: "singleSelect",
    options: ["New", "Active", "Key relationship"],
  },
  custom: null,
};

const TERMINOLOGY: Record<AgentWorkspaceUseCase, AgentWorkspaceSetupPlan["terminology"]> = {
  b2bSales: {
    contact: "contact",
    organization: "account",
    deal: "opportunity",
    service: "offering",
  },
  clientProjects: {
    contact: "client",
    organization: "account",
    deal: "project",
    service: "service",
  },
  productSales: {
    contact: "contact",
    organization: "company",
    deal: "opportunity",
    service: "product",
  },
  relationshipManagement: {
    contact: "person",
    organization: "organization",
    deal: "opportunity",
    service: "offering",
  },
  custom: {
    contact: "contact",
    organization: "organization",
    deal: "deal",
    service: "service",
  },
};

const SETUP_TEXT_KEYS: Record<string, string> = {
  "To do": "toDo",
  "In progress": "inProgress",
  "Due date": "dueDate",
  "Pipeline value by stage": "pipelineValueByStage",
  "Deals by stage": "dealsByStage",
  "Tasks by status": "tasksByStatus",
  "Project health": "projectHealth",
  "On track": "onTrack",
  "At risk": "atRisk",
  "Small team": "smallTeam",
  "Mid-market": "midMarket",
  "Key relationship": "keyRelationship",
  "Discovery workshop": "discoveryWorkshop",
  "Growth rollout": "growthRollout",
  "Northstar pilot": "northstarPilot",
  "Northstar rollout": "northstarRollout",
  "Linden expansion": "lindenExpansion",
  "Confirm discovery goals": "confirmDiscoveryGoals",
  "Prepare rollout proposal": "prepareRolloutProposal",
  "Schedule stakeholder review": "scheduleStakeholderReview",
  "Strategy sprint": "strategySprint",
  "Implementation project": "implementationProject",
  "Juniper discovery": "juniperDiscovery",
  "Juniper implementation": "juniperImplementation",
  "Brightpath relaunch": "brightpathRelaunch",
  "Collect project requirements": "collectProjectRequirements",
  "Review delivery plan": "reviewDeliveryPlan",
  "Book project kickoff": "bookProjectKickoff",
  "Team plan": "teamPlan",
  "Enterprise plan": "enterprisePlan",
  "Oak & Field team plan": "oakFieldTeamPlan",
  "Oak & Field expansion": "oakFieldExpansion",
  "Solaris enterprise plan": "solarisEnterprisePlan",
  "Confirm seat requirements": "confirmSeatRequirements",
  "Share security package": "shareSecurityPackage",
  "Prepare product demo": "prepareProductDemo",
  "Advisory session": "advisorySession",
  "Partnership program": "partnershipProgram",
  "Cedar introduction": "cedarIntroduction",
  "Cedar partnership": "cedarPartnership",
  "Common Ground advisory": "commonGroundAdvisory",
  "Send introduction note": "sendIntroductionNote",
  "Draft partnership outline": "draftPartnershipOutline",
  "Schedule a check-in": "scheduleACheckIn",
  "Example Partner": "examplePartner",
  "Example Customer": "exampleCustomer",
  "Core offering": "coreOffering",
  "Expanded offering": "expandedOffering",
  "Partner opportunity": "partnerOpportunity",
  "Partner expansion": "partnerExpansion",
  "Customer opportunity": "customerOpportunity",
  "Clarify requirements": "clarifyRequirements",
  "Prepare the next step": "prepareTheNextStep",
  "Schedule a follow-up": "scheduleAFollowUp",
  Stage: "stage",
  New: "new",
  Qualified: "qualified",
  Proposal: "proposal",
  Won: "won",
  Status: "status",
  Done: "done",
  Source: "source",
  Referral: "referral",
  Inbound: "inbound",
  Outbound: "outbound",
  Blocked: "blocked",
  Segment: "segment",
  Enterprise: "enterprise",
  Relationship: "relationship",
  Active: "active",
};

function localizeSetupText(value: string, t: AgentTranslator) {
  const key = SETUP_TEXT_KEYS[value];
  if (!key) return value;

  return t(`AgentChat.setup.text.${key}`) || value;
}

export function buildAgentWorkspaceSetupPlan(
  data: PrepareAgentWorkspaceSetupData,
  translate: AgentTranslator = (_key) => "",
): AgentWorkspaceSetupPlan {
  const requestedColumns: AgentSetupColumnPlan[] = (data.customFields ?? []).map((field, index) => ({
    semanticKey: `custom-field-${index + 1}`,
    entityType: field.entityType,
    label: field.label,
    type: field.type,
    options: field.options,
  }));
  const templateColumn = TEMPLATE_COLUMNS[data.useCase];
  const deterministicExtraColumns = requestedColumns.length ? [] : templateColumn ? [templateColumn] : [];
  const columns = [...SHARED_COLUMNS, ...deterministicExtraColumns].map((column) => ({
    ...column,
    label: localizeSetupText(column.label, translate),
    options: column.options.map((option) => localizeSetupText(option, translate)),
  }));
  columns.push(
    ...requestedColumns.map((column) => ({
      ...column,
      options: [...column.options],
    })),
  );
  const sourceRecords = RECORDS[data.useCase];
  const records: AgentSetupRecordPlan = {
    organizations: sourceRecords.organizations.map((name) => localizeSetupText(name, translate)),
    contacts: sourceRecords.contacts.map((contact) => ({ ...contact })),
    services: sourceRecords.services.map((service) => ({
      ...service,
      name: localizeSetupText(service.name, translate),
    })),
    deals: sourceRecords.deals.map((deal) => ({
      ...deal,
      name: localizeSetupText(deal.name, translate),
      contactIndexes: [...deal.contactIndexes],
    })),
    tasks: sourceRecords.tasks.map((task) => ({
      ...task,
      name: localizeSetupText(task.name, translate),
    })),
  };
  return {
    schemaVersion: 1,
    revision: 1,
    useCase: data.useCase,
    businessName: data.businessName,
    goal: data.goal,
    terminology: data.terminology ?? TERMINOLOGY[data.useCase],
    columns,
    records,
    widgets: SHARED_WIDGETS.map((widget) => ({
      ...widget,
      name: localizeSetupText(widget.name, translate),
    })),
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function hashAgentWorkspaceSetupPlan(plan: AgentWorkspaceSetupPlan) {
  const bytes = new TextEncoder().encode(canonicalJson(plan));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function agentWorkspaceSetupCounts(plan: AgentWorkspaceSetupPlan) {
  return {
    columns: plan.columns.length,
    records:
      plan.records.organizations.length +
      plan.records.contacts.length +
      plan.records.services.length +
      plan.records.deals.length +
      plan.records.tasks.length,
    widgets: plan.widgets.length,
  };
}

export function agentWorkspaceSetupTerminologyEntries(plan: AgentWorkspaceSetupPlan) {
  return [
    { entityType: EntityType.contact, presetKey: plan.terminology.contact },
    {
      entityType: EntityType.organization,
      presetKey: plan.terminology.organization,
    },
    { entityType: EntityType.deal, presetKey: plan.terminology.deal },
    { entityType: EntityType.service, presetKey: plan.terminology.service },
  ];
}
