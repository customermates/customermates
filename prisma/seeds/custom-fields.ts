import type { Prisma } from "@/generated/prisma";

import type { ContactSeedData } from "./contacts";
import type { SeedContext } from "./context";
import type { DealSeedData } from "./deals";
import type { OrganizationSeedData } from "./organizations";
import type { ServiceSeedData } from "./services";
import { SYNTHETIC_TASK_PRIORITY_INDEXES, type TaskSeedData } from "./tasks";

import { fixtureId, upsertFixturesById } from "./helpers";

export const SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS = [
  { entityType: "contact", label: "Phones", optionLabels: [], type: "phone" },
  {
    entityType: "service",
    label: "Type",
    optionLabels: ["Service", "Hardware"],
    type: "singleSelect",
  },
  {
    entityType: "organization",
    label: "Type",
    optionLabels: ["Direct customer", "Affiliated company"],
    type: "singleSelect",
  },
  {
    entityType: "organization",
    label: "Website",
    optionLabels: [],
    type: "link",
  },
  {
    entityType: "task",
    label: "Priority",
    optionLabels: ["Low", "Medium", "High"],
    type: "singleSelect",
  },
  {
    entityType: "deal",
    label: "Status",
    optionLabels: ["Open", "Won", "Lost", "Abandoned"],
    type: "singleSelect",
  },
  {
    entityType: "task",
    label: "Status",
    optionLabels: ["Open", "In Progress", "Blocked", "On Hold", "Done", "Archived"],
    type: "singleSelect",
  },
  {
    entityType: "deal",
    label: "Project Period",
    optionLabels: [],
    type: "dateRange",
  },
  {
    entityType: "contact",
    label: "Sales Pipeline",
    optionLabels: ["New", "Contact", "Qualified", "In Progress", "Won", "Lost"],
    type: "singleSelect",
  },
  {
    entityType: "service",
    label: "Pricing model",
    optionLabels: ["Fixed", "Monthly", "Daily"],
    type: "singleSelect",
  },
] as const;

export const SYNTHETIC_CUSTOM_COLUMN_IDS = {
  contactPhone: fixtureId("16000000", 1),
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

export type CustomFieldSeedData = {
  customColumnIds: typeof SYNTHETIC_CUSTOM_COLUMN_IDS;
  customOptionIds: typeof SYNTHETIC_CUSTOM_OPTION_IDS;
};

type CustomFieldValueFixture = Prisma.CustomFieldValueCreateManyInput & {
  id: string;
};

export async function seedCustomFields(
  context: SeedContext,
  entities: CustomFieldSeedInput,
): Promise<CustomFieldSeedData> {
  const { prisma, ids } = context;
  const { contacts, deals, dealDefinitions, organizations, services, tasks, taskDefinitions } = entities;

  const selectOptions = (entries: ReadonlyArray<readonly [string, string, string, boolean?]>) =>
    entries.map(([value, label, color, isDefault], index) => ({
      color,
      index,
      isDefault: isDefault ?? index === 0,
      label,
      value,
    }));

  const serviceTypeOptions = selectOptions([
    [
      SYNTHETIC_CUSTOM_OPTION_IDS.serviceType.service,
      SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[1].optionLabels[0],
      "secondary",
    ],
    [
      SYNTHETIC_CUSTOM_OPTION_IDS.serviceType.hardware,
      SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[1].optionLabels[1],
      "secondary",
    ],
  ]);
  const organizationTypeOptions = selectOptions([
    [
      SYNTHETIC_CUSTOM_OPTION_IDS.organizationType.directCustomer,
      SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[2].optionLabels[0],
      "default",
      false,
    ],
    [
      SYNTHETIC_CUSTOM_OPTION_IDS.organizationType.affiliatedCompany,
      SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[2].optionLabels[1],
      "secondary",
      false,
    ],
  ]);
  const priorityOptions = selectOptions([
    [SYNTHETIC_CUSTOM_OPTION_IDS.taskPriority.low, SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[4].optionLabels[0], "secondary"],
    [SYNTHETIC_CUSTOM_OPTION_IDS.taskPriority.medium, SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[4].optionLabels[1], "info"],
    [
      SYNTHETIC_CUSTOM_OPTION_IDS.taskPriority.high,
      SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[4].optionLabels[2],
      "destructive",
    ],
  ]);
  const dealStatusOptions = selectOptions([
    [SYNTHETIC_CUSTOM_OPTION_IDS.dealStatus.open, SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[5].optionLabels[0], "warning"],
    [SYNTHETIC_CUSTOM_OPTION_IDS.dealStatus.won, SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[5].optionLabels[1], "success"],
    [
      SYNTHETIC_CUSTOM_OPTION_IDS.dealStatus.lost,
      SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[5].optionLabels[2],
      "destructive",
    ],
    [
      SYNTHETIC_CUSTOM_OPTION_IDS.dealStatus.abandoned,
      SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[5].optionLabels[3],
      "secondary",
    ],
  ]);
  const taskStatusOptions = selectOptions([
    [SYNTHETIC_CUSTOM_OPTION_IDS.taskStatus.open, SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[6].optionLabels[0], "info"],
    [
      SYNTHETIC_CUSTOM_OPTION_IDS.taskStatus.inProgress,
      SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[6].optionLabels[1],
      "warning",
    ],
    [
      SYNTHETIC_CUSTOM_OPTION_IDS.taskStatus.blocked,
      SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[6].optionLabels[2],
      "destructive",
    ],
    [
      SYNTHETIC_CUSTOM_OPTION_IDS.taskStatus.onHold,
      SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[6].optionLabels[3],
      "secondary",
    ],
    [SYNTHETIC_CUSTOM_OPTION_IDS.taskStatus.done, SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[6].optionLabels[4], "success"],
    [
      SYNTHETIC_CUSTOM_OPTION_IDS.taskStatus.archived,
      SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[6].optionLabels[5],
      "secondary",
    ],
  ]);
  const contactSalesPipelineOptions = selectOptions([
    [
      SYNTHETIC_CUSTOM_OPTION_IDS.contactSalesPipeline.new,
      SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[8].optionLabels[0],
      "secondary",
    ],
    [
      SYNTHETIC_CUSTOM_OPTION_IDS.contactSalesPipeline.contact,
      SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[8].optionLabels[1],
      "default",
    ],
    [
      SYNTHETIC_CUSTOM_OPTION_IDS.contactSalesPipeline.qualified,
      SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[8].optionLabels[2],
      "info",
    ],
    [
      SYNTHETIC_CUSTOM_OPTION_IDS.contactSalesPipeline.inProgress,
      SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[8].optionLabels[3],
      "warning",
    ],
    [
      SYNTHETIC_CUSTOM_OPTION_IDS.contactSalesPipeline.won,
      SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[8].optionLabels[4],
      "success",
    ],
    [
      SYNTHETIC_CUSTOM_OPTION_IDS.contactSalesPipeline.lost,
      SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[8].optionLabels[5],
      "destructive",
    ],
  ]);
  const servicePricingOptions = selectOptions([
    [
      SYNTHETIC_CUSTOM_OPTION_IDS.servicePricing.fixed,
      SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[9].optionLabels[0],
      "default",
    ],
    [
      SYNTHETIC_CUSTOM_OPTION_IDS.servicePricing.monthly,
      SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[9].optionLabels[1],
      "secondary",
    ],
    [
      SYNTHETIC_CUSTOM_OPTION_IDS.servicePricing.daily,
      SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[9].optionLabels[2],
      "success",
    ],
  ]);

  const customColumns = [
    {
      id: SYNTHETIC_CUSTOM_COLUMN_IDS.contactPhone,
      companyId: ids.company,
      entityType: SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[0].entityType,
      label: SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[0].label,
      options: { allowMultiple: true, color: "secondary" },
      type: SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[0].type,
    },
    {
      id: SYNTHETIC_CUSTOM_COLUMN_IDS.serviceType,
      companyId: ids.company,
      entityType: SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[1].entityType,
      label: SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[1].label,
      options: { options: serviceTypeOptions },
      type: SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[1].type,
    },
    {
      id: SYNTHETIC_CUSTOM_COLUMN_IDS.organizationType,
      companyId: ids.company,
      entityType: SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[2].entityType,
      label: SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[2].label,
      options: { options: organizationTypeOptions },
      type: SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[2].type,
    },
    {
      id: SYNTHETIC_CUSTOM_COLUMN_IDS.organizationWebsite,
      companyId: ids.company,
      entityType: SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[3].entityType,
      label: SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[3].label,
      options: { allowMultiple: false, color: "secondary" },
      type: SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[3].type,
    },
    {
      id: SYNTHETIC_CUSTOM_COLUMN_IDS.taskPriority,
      companyId: ids.company,
      entityType: SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[4].entityType,
      label: SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[4].label,
      options: { options: priorityOptions },
      type: SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[4].type,
    },
    {
      id: SYNTHETIC_CUSTOM_COLUMN_IDS.dealStatus,
      companyId: ids.company,
      entityType: SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[5].entityType,
      label: SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[5].label,
      options: { options: dealStatusOptions },
      type: SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[5].type,
    },
    {
      id: SYNTHETIC_CUSTOM_COLUMN_IDS.taskStatus,
      companyId: ids.company,
      entityType: SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[6].entityType,
      label: SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[6].label,
      options: { options: taskStatusOptions },
      type: SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[6].type,
    },
    {
      id: SYNTHETIC_CUSTOM_COLUMN_IDS.dealProjectPeriod,
      companyId: ids.company,
      entityType: SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[7].entityType,
      label: SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[7].label,
      options: { displayFormat: "numericalShort" },
      type: SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[7].type,
    },
    {
      id: SYNTHETIC_CUSTOM_COLUMN_IDS.contactSalesPipeline,
      companyId: ids.company,
      entityType: SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[8].entityType,
      label: SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[8].label,
      options: { options: contactSalesPipelineOptions },
      type: SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[8].type,
    },
    {
      id: SYNTHETIC_CUSTOM_COLUMN_IDS.servicePricing,
      companyId: ids.company,
      entityType: SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[9].entityType,
      label: SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[9].label,
      options: { options: servicePricingOptions },
      type: SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS[9].type,
    },
  ] satisfies Prisma.CustomColumnCreateManyInput[];

  let customFieldValueIndex = 0;
  const customFieldValue = (input: Omit<Prisma.CustomFieldValueCreateManyInput, "id">): CustomFieldValueFixture => ({
    id: fixtureId("18000000", ++customFieldValueIndex),
    ...input,
  });

  const contactSalesPipelineIndexes = [
    5, 1, 4, 2, 1, 0, 5, 3, 2, 1, 0, 0, 0, 0, 0, 4, 2, 5, 0, 5, 4, 0, 2, 0, 3, 1, 0, 3, 3, 4,
  ] as const;
  const organizationTypeIndexes = [1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0] as const;
  const hardwareServiceIndexes = new Set([2, 7, 11, 19, 20, 24, 30, 34, 36, 39, 42]);
  const monthlyServiceIndexes = new Set([14, 21, 25, 28, 29]);
  const dailyServiceIndexes = new Set([9, 13, 23, 26, 32, 35]);

  const customFieldValues: CustomFieldValueFixture[] = [
    ...contacts.flatMap((contact, index) => [
      customFieldValue({
        columnId: SYNTHETIC_CUSTOM_COLUMN_IDS.contactPhone,
        companyId: ids.company,
        contactId: contact.id,
        entityType: "contact",
        type: "phone",
        value: `+1 202-555-${String(100 + index).padStart(4, "0")}`,
      }),
      customFieldValue({
        columnId: SYNTHETIC_CUSTOM_COLUMN_IDS.contactSalesPipeline,
        companyId: ids.company,
        contactId: contact.id,
        entityType: "contact",
        type: "singleSelect",
        value: contactSalesPipelineOptions[contactSalesPipelineIndexes[index]].value,
      }),
    ]),
    ...organizations.flatMap((organization, index) => [
      customFieldValue({
        columnId: SYNTHETIC_CUSTOM_COLUMN_IDS.organizationType,
        companyId: ids.company,
        entityType: "organization",
        organizationId: organization.id,
        type: "singleSelect",
        value: organizationTypeOptions[organizationTypeIndexes[index]].value,
      }),
      customFieldValue({
        columnId: SYNTHETIC_CUSTOM_COLUMN_IDS.organizationWebsite,
        companyId: ids.company,
        entityType: "organization",
        organizationId: organization.id,
        type: "link",
        value: organization.website,
      }),
    ]),
    ...deals.flatMap((deal, index) => [
      customFieldValue({
        columnId: SYNTHETIC_CUSTOM_COLUMN_IDS.dealStatus,
        companyId: ids.company,
        dealId: deal.id,
        entityType: "deal",
        type: "singleSelect",
        value: dealStatusOptions[dealDefinitions[index][3]].value,
      }),
      customFieldValue({
        columnId: SYNTHETIC_CUSTOM_COLUMN_IDS.dealProjectPeriod,
        companyId: ids.company,
        dealId: deal.id,
        entityType: "deal",
        type: "dateRange",
        value: `2026-${String((index % 9) + 1).padStart(2, "0")}-01,2026-${String((index % 9) + 3).padStart(2, "0")}-28`,
      }),
    ]),
    ...services.flatMap((service, index) => [
      customFieldValue({
        columnId: SYNTHETIC_CUSTOM_COLUMN_IDS.serviceType,
        companyId: ids.company,
        entityType: "service",
        serviceId: service.id,
        type: "singleSelect",
        value: serviceTypeOptions[hardwareServiceIndexes.has(index) ? 1 : 0].value,
      }),
      customFieldValue({
        columnId: SYNTHETIC_CUSTOM_COLUMN_IDS.servicePricing,
        companyId: ids.company,
        entityType: "service",
        serviceId: service.id,
        type: "singleSelect",
        value:
          servicePricingOptions[dailyServiceIndexes.has(index) ? 2 : monthlyServiceIndexes.has(index) ? 1 : 0].value,
      }),
    ]),
    ...tasks.flatMap((task, index) => [
      customFieldValue({
        columnId: SYNTHETIC_CUSTOM_COLUMN_IDS.taskPriority,
        companyId: ids.company,
        entityType: "task",
        taskId: task.id,
        type: "singleSelect",
        value: priorityOptions[SYNTHETIC_TASK_PRIORITY_INDEXES[index]].value,
      }),
      customFieldValue({
        columnId: SYNTHETIC_CUSTOM_COLUMN_IDS.taskStatus,
        companyId: ids.company,
        entityType: "task",
        taskId: task.id,
        type: "singleSelect",
        value: taskStatusOptions[taskDefinitions[index][5]].value,
      }),
    ]),
  ];

  await upsertFixturesById(customColumns, (customColumn) =>
    prisma.customColumn.upsert({
      where: { id: customColumn.id },
      update: customColumn,
      create: customColumn,
    }),
  );
  await upsertFixturesById(customFieldValues, (value) =>
    prisma.customFieldValue.upsert({
      where: { id: value.id },
      update: value,
      create: value,
    }),
  );

  return {
    customColumnIds: SYNTHETIC_CUSTOM_COLUMN_IDS,
    customOptionIds: SYNTHETIC_CUSTOM_OPTION_IDS,
  };
}
