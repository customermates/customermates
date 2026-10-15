import { presetId } from "@/features/records/crm-preset";
import type { RecordField, RecordScalar } from "@/features/records/record-model.schema";

import type { ContactSeedData } from "./contacts";
import type { SeedContext } from "./context";
import type { DealSeedData } from "./deals";

import { SYNTHETIC_DEAL_STATUS_WEIGHTS } from "./deals";
import type { OrganizationSeedData } from "./organizations";
import type { ServiceSeedData } from "./services";
import { SYNTHETIC_TASK_PRIORITY_INDEXES, type TaskSeedData } from "./tasks";

import { fixtureId } from "./helpers";
import { northwindDataset, northwindDay } from "./northwind-data";

export type SyntheticRecordType = "contact" | "organization" | "deal" | "service" | "task";

export const SYNTHETIC_CUSTOM_FIELD_DEFINITIONS = [
  { recordType: "service", label: "Type", optionLabels: ["Service", "Subscription"], valueType: "select" },
  {
    recordType: "organization",
    label: "Customer status",
    optionLabels: ["Customer", "Prospect", "Former customer"],
    valueType: "select",
  },
  { recordType: "organization", label: "Website", optionLabels: [], valueType: "url" },
  { recordType: "task", label: "Priority", optionLabels: ["Low", "Medium", "High"], valueType: "select" },
  { recordType: "deal", label: "Status", optionLabels: ["Open", "Won", "Lost", "Abandoned"], valueType: "select" },
  {
    recordType: "task",
    label: "Status",
    optionLabels: ["Open", "In Progress", "Blocked", "On Hold", "Done", "Archived"],
    valueType: "select",
  },
  { recordType: "deal", label: "Contract term", optionLabels: [], valueType: "dateRange" },
  {
    recordType: "contact",
    label: "Lifecycle stage",
    optionLabels: ["Lead", "Marketing qualified", "Sales qualified", "Opportunity", "Customer", "Disqualified"],
    valueType: "select",
  },
  {
    recordType: "service",
    label: "Pricing model",
    optionLabels: ["One-time", "Annual subscription", "Per day"],
    valueType: "select",
  },
] as const;

export const SYNTHETIC_CUSTOM_FIELD_IDS = {
  serviceType: fixtureId("16000000", 2),
  organizationType: fixtureId("16000000", 3),
  organizationWebsite: fixtureId("16000000", 4),
  taskPriority: fixtureId("16000000", 5),
  dealStatus: fixtureId("16000000", 6),
  taskStatus: fixtureId("16000000", 7),
  dealProjectPeriod: fixtureId("16000000", 8),
  contactSalesPipeline: fixtureId("16000000", 9),
  servicePricing: fixtureId("16000000", 10),
} as const;

export const SYNTHETIC_CUSTOM_OPTION_IDS = {
  serviceType: {
    service: fixtureId("17000000", 1),
    hardware: fixtureId("17000000", 2),
  },
  organizationType: {
    directCustomer: fixtureId("17000000", 3),
    affiliatedCompany: fixtureId("17000000", 4),
    formerCustomer: fixtureId("17000000", 27),
  },
  taskPriority: {
    low: fixtureId("17000000", 5),
    medium: fixtureId("17000000", 6),
    high: fixtureId("17000000", 7),
  },
  dealStatus: {
    open: fixtureId("17000000", 8),
    won: fixtureId("17000000", 9),
    lost: fixtureId("17000000", 10),
    abandoned: fixtureId("17000000", 11),
  },
  taskStatus: {
    open: fixtureId("17000000", 12),
    inProgress: fixtureId("17000000", 13),
    blocked: fixtureId("17000000", 14),
    onHold: fixtureId("17000000", 15),
    done: fixtureId("17000000", 16),
    archived: fixtureId("17000000", 17),
  },
  contactSalesPipeline: {
    new: fixtureId("17000000", 18),
    contact: fixtureId("17000000", 19),
    qualified: fixtureId("17000000", 20),
    inProgress: fixtureId("17000000", 21),
    won: fixtureId("17000000", 22),
    lost: fixtureId("17000000", 23),
  },
  servicePricing: {
    fixed: fixtureId("17000000", 24),
    monthly: fixtureId("17000000", 25),
    daily: fixtureId("17000000", 26),
  },
} as const;

export type CustomFieldSeedInput = ContactSeedData &
  DealSeedData &
  OrganizationSeedData &
  ServiceSeedData &
  TaskSeedData;

export type SyntheticCustomField = Omit<RecordField, "position">;

export type SyntheticCustomFieldValue = {
  recordType: SyntheticRecordType;
  recordId: string;
  fieldId: string;
  value: RecordScalar;
};

export type CustomFieldSeedData = {
  customFields: SyntheticCustomField[];
  customFieldValues: SyntheticCustomFieldValue[];
  customFieldIds: typeof SYNTHETIC_CUSTOM_FIELD_IDS;
  customOptionIds: typeof SYNTHETIC_CUSTOM_OPTION_IDS;
};

type OptionDefinition = readonly [id: string, label: string, color: string, probability?: number];

export function seedCustomFields(context: SeedContext, entities: CustomFieldSeedInput): CustomFieldSeedData {
  const companyId = context.ids.company;
  const { contacts, deals, organizations, services, tasks, taskDefinitions } = entities;
  const ids = SYNTHETIC_CUSTOM_FIELD_IDS;
  const options = SYNTHETIC_CUSTOM_OPTION_IDS;

  const field = (
    index: number,
    id: string,
    shape: Pick<SyntheticCustomField, "multiple" | "format" | "options" | "behavior">,
  ): SyntheticCustomField => {
    const definition = SYNTHETIC_CUSTOM_FIELD_DEFINITIONS[index];
    return {
      id,
      typeId: presetId(companyId, definition.recordType),
      label: definition.label,
      valueType: definition.valueType,
      required: false,
      archived: false,
      publishedSummary: false,
      ...shape,
    };
  };
  const format = (color: string | null, dateFormat: string | null = null) => ({ color, dateFormat, currency: null });
  const select = (index: number, id: string, entries: OptionDefinition[], defaultOption: string | null) =>
    field(index, id, {
      multiple: false,
      format: format(null),
      behavior: defaultOption
        ? { kind: "input", defaultValue: { kind: "select", value: defaultOption } }
        : { kind: "input" },
      options: entries.map(([optionId, label, color, probability]) => ({
        id: optionId,
        label,
        color,
        attributes:
          probability === undefined
            ? []
            : [{ key: "probability", value: { kind: "decimal", value: String(probability), currency: null } }],
      })),
    });

  const serviceTypeOptions: OptionDefinition[] = [
    [options.serviceType.service, SYNTHETIC_CUSTOM_FIELD_DEFINITIONS[0].optionLabels[0], "secondary"],
    [options.serviceType.hardware, SYNTHETIC_CUSTOM_FIELD_DEFINITIONS[0].optionLabels[1], "info"],
  ];
  const organizationTypeOptions: OptionDefinition[] = [
    [options.organizationType.directCustomer, SYNTHETIC_CUSTOM_FIELD_DEFINITIONS[1].optionLabels[0], "success"],
    [options.organizationType.affiliatedCompany, SYNTHETIC_CUSTOM_FIELD_DEFINITIONS[1].optionLabels[1], "info"],
    [options.organizationType.formerCustomer, SYNTHETIC_CUSTOM_FIELD_DEFINITIONS[1].optionLabels[2], "secondary"],
  ];
  const priorityOptions: OptionDefinition[] = [
    [options.taskPriority.low, SYNTHETIC_CUSTOM_FIELD_DEFINITIONS[3].optionLabels[0], "secondary"],
    [options.taskPriority.medium, SYNTHETIC_CUSTOM_FIELD_DEFINITIONS[3].optionLabels[1], "info"],
    [options.taskPriority.high, SYNTHETIC_CUSTOM_FIELD_DEFINITIONS[3].optionLabels[2], "destructive"],
  ];
  const dealStatusOptions: OptionDefinition[] = [
    [
      options.dealStatus.open,
      SYNTHETIC_CUSTOM_FIELD_DEFINITIONS[4].optionLabels[0],
      "warning",
      SYNTHETIC_DEAL_STATUS_WEIGHTS[0],
    ],
    [
      options.dealStatus.won,
      SYNTHETIC_CUSTOM_FIELD_DEFINITIONS[4].optionLabels[1],
      "success",
      SYNTHETIC_DEAL_STATUS_WEIGHTS[1],
    ],
    [
      options.dealStatus.lost,
      SYNTHETIC_CUSTOM_FIELD_DEFINITIONS[4].optionLabels[2],
      "destructive",
      SYNTHETIC_DEAL_STATUS_WEIGHTS[2],
    ],
    [
      options.dealStatus.abandoned,
      SYNTHETIC_CUSTOM_FIELD_DEFINITIONS[4].optionLabels[3],
      "secondary",
      SYNTHETIC_DEAL_STATUS_WEIGHTS[3],
    ],
  ];
  const taskStatusOptions: OptionDefinition[] = [
    [options.taskStatus.open, SYNTHETIC_CUSTOM_FIELD_DEFINITIONS[5].optionLabels[0], "info"],
    [options.taskStatus.inProgress, SYNTHETIC_CUSTOM_FIELD_DEFINITIONS[5].optionLabels[1], "warning"],
    [options.taskStatus.blocked, SYNTHETIC_CUSTOM_FIELD_DEFINITIONS[5].optionLabels[2], "destructive"],
    [options.taskStatus.onHold, SYNTHETIC_CUSTOM_FIELD_DEFINITIONS[5].optionLabels[3], "secondary"],
    [options.taskStatus.done, SYNTHETIC_CUSTOM_FIELD_DEFINITIONS[5].optionLabels[4], "success"],
    [options.taskStatus.archived, SYNTHETIC_CUSTOM_FIELD_DEFINITIONS[5].optionLabels[5], "secondary"],
  ];
  const contactSalesPipelineOptions: OptionDefinition[] = [
    [options.contactSalesPipeline.new, SYNTHETIC_CUSTOM_FIELD_DEFINITIONS[7].optionLabels[0], "secondary"],
    [options.contactSalesPipeline.contact, SYNTHETIC_CUSTOM_FIELD_DEFINITIONS[7].optionLabels[1], "default"],
    [options.contactSalesPipeline.qualified, SYNTHETIC_CUSTOM_FIELD_DEFINITIONS[7].optionLabels[2], "info"],
    [options.contactSalesPipeline.inProgress, SYNTHETIC_CUSTOM_FIELD_DEFINITIONS[7].optionLabels[3], "warning"],
    [options.contactSalesPipeline.won, SYNTHETIC_CUSTOM_FIELD_DEFINITIONS[7].optionLabels[4], "success"],
    [options.contactSalesPipeline.lost, SYNTHETIC_CUSTOM_FIELD_DEFINITIONS[7].optionLabels[5], "destructive"],
  ];
  const servicePricingOptions: OptionDefinition[] = [
    [options.servicePricing.fixed, SYNTHETIC_CUSTOM_FIELD_DEFINITIONS[8].optionLabels[0], "default"],
    [options.servicePricing.monthly, SYNTHETIC_CUSTOM_FIELD_DEFINITIONS[8].optionLabels[1], "secondary"],
    [options.servicePricing.daily, SYNTHETIC_CUSTOM_FIELD_DEFINITIONS[8].optionLabels[2], "success"],
  ];

  const customFields: SyntheticCustomField[] = [
    select(0, ids.serviceType, serviceTypeOptions, options.serviceType.service),
    select(1, ids.organizationType, organizationTypeOptions, null),
    field(2, ids.organizationWebsite, {
      multiple: false,
      format: format("secondary"),
      behavior: { kind: "input" },
      options: [],
    }),
    select(3, ids.taskPriority, priorityOptions, options.taskPriority.low),
    select(4, ids.dealStatus, dealStatusOptions, options.dealStatus.open),
    select(5, ids.taskStatus, taskStatusOptions, options.taskStatus.open),
    field(6, ids.dealProjectPeriod, {
      multiple: false,
      format: format(null, "numericalShort"),
      behavior: { kind: "input" },
      options: [],
    }),
    select(7, ids.contactSalesPipeline, contactSalesPipelineOptions, options.contactSalesPipeline.new),
    select(8, ids.servicePricing, servicePricingOptions, options.servicePricing.fixed),
  ];

  const data = northwindDataset();
  const selected = (entries: OptionDefinition[], index: number): RecordScalar => ({
    kind: "select",
    value: entries[index][0],
  });
  const lifecycleIndex = { new: 0, contact: 1, qualified: 2, inProgress: 3, won: 4, lost: 5 } as const;
  const profileIndex = { legacyCustomer: 0, newCustomer: 0, prospect: 1, formerCustomer: 2 } as const;
  const statusIndex = { open: 0, won: 1, lost: 2, abandoned: 3 } as const;
  const day = (ms: number) => northwindDay(ms);

  const customFieldValues: SyntheticCustomFieldValue[] = [
    ...contacts.flatMap((contact, index) => {
      const source = data.contacts[index];
      if (!source) throw new Error(`Missing Northwind contact ${index}`);
      return [
        {
          recordType: "contact" as const,
          recordId: contact.id,
          fieldId: ids.contactSalesPipeline,
          value: selected(contactSalesPipelineOptions, lifecycleIndex[source.lifecycle]),
        },
      ];
    }),
    ...organizations.flatMap((organization, index) => {
      const source = data.organizations[index];
      if (!source) throw new Error(`Missing Northwind organization ${index}`);
      return [
        {
          recordType: "organization" as const,
          recordId: organization.id,
          fieldId: ids.organizationType,
          value: selected(organizationTypeOptions, profileIndex[source.profile]),
        },
        {
          recordType: "organization" as const,
          recordId: organization.id,
          fieldId: ids.organizationWebsite,
          value: { kind: "text" as const, value: organization.website },
        },
      ];
    }),
    ...deals.flatMap((deal, index) => {
      const source = data.deals[index];
      if (!source) throw new Error(`Missing Northwind deal ${index}`);
      const termStart = source.closeAtMs + 14 * 86_400_000;
      return [
        {
          recordType: "deal" as const,
          recordId: deal.id,
          fieldId: ids.dealStatus,
          value: selected(dealStatusOptions, statusIndex[source.status]),
        },
        ...(source.status === "lost" || source.status === "abandoned"
          ? []
          : [
              {
                recordType: "deal" as const,
                recordId: deal.id,
                fieldId: ids.dealProjectPeriod,
                value: {
                  kind: "range" as const,
                  start: day(termStart),
                  end: day(termStart + 364 * 86_400_000),
                },
              },
            ]),
      ];
    }),
    ...services.flatMap((service, index) => {
      const source = data.services[index];
      if (!source) throw new Error(`Missing Northwind service ${index}`);
      return [
        {
          recordType: "service" as const,
          recordId: service.id,
          fieldId: ids.serviceType,
          value: selected(serviceTypeOptions, source[2] === "license" ? 1 : 0),
        },
        {
          recordType: "service" as const,
          recordId: service.id,
          fieldId: ids.servicePricing,
          value: selected(servicePricingOptions, source[3] === "subscription" ? 1 : source[3] === "perDay" ? 2 : 0),
        },
      ];
    }),
    ...tasks.flatMap((task, index) => [
      {
        recordType: "task" as const,
        recordId: task.id,
        fieldId: ids.taskPriority,
        value: selected(priorityOptions, SYNTHETIC_TASK_PRIORITY_INDEXES[index] ?? 0),
      },
      {
        recordType: "task" as const,
        recordId: task.id,
        fieldId: ids.taskStatus,
        value: selected(taskStatusOptions, taskDefinitions[index]?.[5] ?? 0),
      },
    ]),
  ];

  return {
    customFields,
    customFieldValues,
    customFieldIds: SYNTHETIC_CUSTOM_FIELD_IDS,
    customOptionIds: SYNTHETIC_CUSTOM_OPTION_IDS,
  };
}
