import type { Data } from "@/core/validation/validation.utils";
import type { CustomColumnDto, CustomColumnOption } from "@/features/custom-column/custom-column.schema";
import type { DateBucket } from "./grouping.schema";

import { z } from "zod";

import { CustomColumnType, EntityType, TaskType } from "@/generated/prisma";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { DATE_BUCKETS, GroupingSchema } from "./grouping.schema";

export const GROUPABLE_MODELS = ["contact", "deal", "organization", "service", "task"] as const;
export type GroupableModel = (typeof GROUPABLE_MODELS)[number];
export type GroupingTargetModel = GroupableModel | "user";

export const ENTITY_CUSTOM_FIELD_RELATION = {
  [EntityType.contact]: "contact",
  [EntityType.deal]: "deal",
  [EntityType.organization]: "organization",
  [EntityType.service]: "service",
  [EntityType.task]: "task",
} satisfies Record<EntityType, string>;

export const GROUPABLE_MODEL_BY_ENTITY_TYPE = {
  [EntityType.contact]: "contact",
  [EntityType.deal]: "deal",
  [EntityType.organization]: "organization",
  [EntityType.service]: "service",
  [EntityType.task]: "task",
} satisfies Record<EntityType, GroupableModel>;

export type GroupingKind = "customSingleSelect" | "enum" | "relation" | "dateBucket";

export type RelationWiring = {
  collection: string;
  joinModel: string;
  keyColumn: string;
  parentRelation: string;
  targetModel: GroupingTargetModel;
  targetRelation: string;
};

export type EnumWiring = {
  column: string;
  values: readonly string[];
  nullable: boolean;
  labelKey: string;
  valueLabelKey: (value: string) => string;
};

export const GROUPING_JOIN = {
  contact: {
    dealIds: {
      collection: "deals",
      joinModel: "dealContact",
      keyColumn: "dealId",
      parentRelation: "contact",
      targetModel: "deal",
      targetRelation: "deal",
    },
    organizationIds: {
      collection: "organizations",
      joinModel: "contactOrganization",
      keyColumn: "organizationId",
      parentRelation: "contact",
      targetModel: "organization",
      targetRelation: "organization",
    },
    taskIds: {
      collection: "tasks",
      joinModel: "taskContact",
      keyColumn: "taskId",
      parentRelation: "contact",
      targetModel: "task",
      targetRelation: "task",
    },
    userIds: {
      collection: "users",
      joinModel: "contactUser",
      keyColumn: "userId",
      parentRelation: "contact",
      targetModel: "user",
      targetRelation: "user",
    },
  },
  deal: {
    contactIds: {
      collection: "contacts",
      joinModel: "dealContact",
      keyColumn: "contactId",
      parentRelation: "deal",
      targetModel: "contact",
      targetRelation: "contact",
    },
    organizationIds: {
      collection: "organizations",
      joinModel: "dealOrganization",
      keyColumn: "organizationId",
      parentRelation: "deal",
      targetModel: "organization",
      targetRelation: "organization",
    },
    serviceIds: {
      collection: "services",
      joinModel: "serviceDeal",
      keyColumn: "serviceId",
      parentRelation: "deal",
      targetModel: "service",
      targetRelation: "service",
    },
    taskIds: {
      collection: "tasks",
      joinModel: "taskDeal",
      keyColumn: "taskId",
      parentRelation: "deal",
      targetModel: "task",
      targetRelation: "task",
    },
    userIds: {
      collection: "users",
      joinModel: "dealUser",
      keyColumn: "userId",
      parentRelation: "deal",
      targetModel: "user",
      targetRelation: "user",
    },
  },
  organization: {
    contactIds: {
      collection: "contacts",
      joinModel: "contactOrganization",
      keyColumn: "contactId",
      parentRelation: "organization",
      targetModel: "contact",
      targetRelation: "contact",
    },
    dealIds: {
      collection: "deals",
      joinModel: "dealOrganization",
      keyColumn: "dealId",
      parentRelation: "organization",
      targetModel: "deal",
      targetRelation: "deal",
    },
    taskIds: {
      collection: "tasks",
      joinModel: "taskOrganization",
      keyColumn: "taskId",
      parentRelation: "organization",
      targetModel: "task",
      targetRelation: "task",
    },
    userIds: {
      collection: "users",
      joinModel: "organizationUser",
      keyColumn: "userId",
      parentRelation: "organization",
      targetModel: "user",
      targetRelation: "user",
    },
  },
  service: {
    dealIds: {
      collection: "deals",
      joinModel: "serviceDeal",
      keyColumn: "dealId",
      parentRelation: "service",
      targetModel: "deal",
      targetRelation: "deal",
    },
    taskIds: {
      collection: "tasks",
      joinModel: "taskService",
      keyColumn: "taskId",
      parentRelation: "service",
      targetModel: "task",
      targetRelation: "task",
    },
    userIds: {
      collection: "users",
      joinModel: "serviceUser",
      keyColumn: "userId",
      parentRelation: "service",
      targetModel: "user",
      targetRelation: "user",
    },
  },
  task: {
    contactIds: {
      collection: "contacts",
      joinModel: "taskContact",
      keyColumn: "contactId",
      parentRelation: "task",
      targetModel: "contact",
      targetRelation: "contact",
    },
    dealIds: {
      collection: "deals",
      joinModel: "taskDeal",
      keyColumn: "dealId",
      parentRelation: "task",
      targetModel: "deal",
      targetRelation: "deal",
    },
    organizationIds: {
      collection: "organizations",
      joinModel: "taskOrganization",
      keyColumn: "organizationId",
      parentRelation: "task",
      targetModel: "organization",
      targetRelation: "organization",
    },
    serviceIds: {
      collection: "services",
      joinModel: "taskService",
      keyColumn: "serviceId",
      parentRelation: "task",
      targetModel: "service",
      targetRelation: "service",
    },
    userIds: {
      collection: "users",
      joinModel: "taskUser",
      keyColumn: "userId",
      parentRelation: "task",
      targetModel: "user",
      targetRelation: "user",
    },
  },
} satisfies Record<GroupableModel, Readonly<Partial<Record<FilterFieldKey, RelationWiring>>>>;

export const GROUPING_ENUM = {
  contact: {},
  deal: {},
  organization: {},
  service: {},
  task: {
    type: {
      column: "type",
      values: Object.values(TaskType),
      nullable: false,
      labelKey: "Common.table.columns.type",
      valueLabelKey: (value: string) => `Common.taskTypes.${value}`,
    },
  },
} satisfies Record<GroupableModel, Readonly<Record<string, EnumWiring>>>;

export const GROUPABLE_DATE_FIELDS = [FilterFieldKey.createdAt, FilterFieldKey.updatedAt] as const;

export type GroupableRelationField<M extends GroupableModel> = keyof (typeof GROUPING_JOIN)[M] & string;
export type GroupableEnumField<M extends GroupableModel> = keyof (typeof GROUPING_ENUM)[M] & string;
export type GroupableDateField = (typeof GROUPABLE_DATE_FIELDS)[number];

export type GroupableClaims<T extends string> = Record<T, boolean>;

type SpecBase = { field: string; model: GroupableModel };

export type GroupableFieldSpec =
  | (SpecBase & {
      kind: "customSingleSelect";
      columnId: string;
      entityType: EntityType;
      label: string;
      options: readonly CustomColumnOption[];
    })
  | (SpecBase & {
      kind: "enum";
      column: string;
      values: readonly string[];
      nullable: boolean;
      labelKey: string;
      valueLabelKey: (value: string) => string;
    })
  | (SpecBase & {
      kind: "relation";
      collection: string;
      joinModel: string;
      keyColumn: string;
      parentRelation: string;
      targetModel: GroupingTargetModel;
      targetRelation: string;
      labelKey: string;
    })
  | (SpecBase & {
      kind: "dateBucket";
      column: string;
      buckets: readonly DateBucket[];
      labelKey: string;
    });

export const GroupableFieldDtoSchema = z.object({
  id: z.string(),
  grouping: GroupingSchema,
  kind: z.enum(["customSingleSelect", "enum", "relation", "dateBucket"]),
  label: z.string().optional(),
  labelKey: z.string().optional(),
  bucket: z.enum(DATE_BUCKETS).optional(),
  supportsDragWriteBack: z.boolean(),
});
export type GroupableFieldDto = Data<typeof GroupableFieldDtoSchema>;

type SingleSelectColumn = Extract<CustomColumnDto, { type: typeof CustomColumnType.singleSelect }>;

export function customSelectGroupable(args: {
  column: SingleSelectColumn;
  model: GroupableModel;
  entityType: EntityType;
}): GroupableFieldSpec {
  return {
    kind: "customSingleSelect",
    field: args.column.id,
    model: args.model,
    columnId: args.column.id,
    entityType: args.entityType,
    label: args.column.label,
    options: args.column.options?.options ?? [],
  };
}

export function customSelectGroupables(
  entityType: EntityType,
  columns: readonly CustomColumnDto[],
): GroupableFieldSpec[] {
  const model = GROUPABLE_MODEL_BY_ENTITY_TYPE[entityType];

  return columns
    .filter(
      (column): column is SingleSelectColumn =>
        column.type === CustomColumnType.singleSelect && column.entityType === entityType,
    )
    .map((column) => customSelectGroupable({ column, model, entityType }));
}

export function relationGroupable<M extends GroupableModel>(args: {
  model: M;
  field: GroupableRelationField<M>;
}): GroupableFieldSpec {
  const wiring = (GROUPING_JOIN[args.model] as Record<string, RelationWiring | undefined>)[args.field];
  if (!wiring) throw new Error(`No grouping join wired for ${args.model}.${args.field}`);

  return {
    kind: "relation",
    field: args.field,
    model: args.model,
    collection: wiring.collection,
    joinModel: wiring.joinModel,
    keyColumn: wiring.keyColumn,
    parentRelation: wiring.parentRelation,
    targetModel: wiring.targetModel,
    targetRelation: wiring.targetRelation,
    labelKey: `Common.filters.fields.${args.field}`,
  };
}

export function relationGroupables<M extends GroupableModel>(
  model: M,
  claims: GroupableClaims<GroupableRelationField<M>>,
): GroupableFieldSpec[] {
  return claimedFields(claims).map((field) => relationGroupable({ model, field }));
}

export function enumGroupable<M extends GroupableModel>(args: {
  model: M;
  field: GroupableEnumField<M>;
}): GroupableFieldSpec {
  const wiring = (GROUPING_ENUM[args.model] as Record<string, EnumWiring | undefined>)[args.field];
  if (!wiring) throw new Error(`No grouping enum wired for ${args.model}.${args.field}`);
  if (wiring.values.length === 0) throw new Error(`Grouping enum ${args.model}.${args.field} declares no values`);

  return {
    kind: "enum",
    field: args.field,
    model: args.model,
    column: wiring.column,
    values: wiring.values,
    nullable: wiring.nullable,
    labelKey: wiring.labelKey,
    valueLabelKey: wiring.valueLabelKey,
  };
}

export function enumGroupables<M extends GroupableModel>(
  model: M,
  claims: GroupableClaims<GroupableEnumField<M>>,
): GroupableFieldSpec[] {
  return claimedFields(claims).map((field) => enumGroupable({ model, field }));
}

export function dateGroupable<M extends GroupableModel>(args: {
  model: M;
  field: GroupableDateField;
}): GroupableFieldSpec {
  return {
    kind: "dateBucket",
    field: args.field,
    model: args.model,
    column: args.field,
    buckets: DATE_BUCKETS,
    labelKey: `Common.filters.fields.${args.field}`,
  };
}

export function dateGroupables<M extends GroupableModel>(
  model: M,
  claims: GroupableClaims<GroupableDateField>,
): GroupableFieldSpec[] {
  return claimedFields(claims).map((field) => dateGroupable({ model, field }));
}

export function groupableFieldDtos(specs: readonly GroupableFieldSpec[]): GroupableFieldDto[] {
  return specs.flatMap((spec): GroupableFieldDto[] => {
    switch (spec.kind) {
      case "customSingleSelect":
        return [
          {
            id: spec.field,
            grouping: { field: spec.field },
            kind: spec.kind,
            label: spec.label,
            supportsDragWriteBack: true,
          },
        ];
      case "enum":
        return [
          {
            id: spec.field,
            grouping: { field: spec.field },
            kind: spec.kind,
            labelKey: spec.labelKey,
            supportsDragWriteBack: false,
          },
        ];
      case "relation":
        return [
          {
            id: spec.field,
            grouping: { field: spec.field },
            kind: spec.kind,
            labelKey: spec.labelKey,
            supportsDragWriteBack: false,
          },
        ];
      case "dateBucket":
        return spec.buckets.map((bucket) => ({
          id: `${spec.field}:${bucket}`,
          grouping: { field: spec.field, bucket },
          kind: spec.kind,
          labelKey: spec.labelKey,
          bucket,
          supportsDragWriteBack: false,
        }));
      default: {
        const exhaustive: never = spec;
        throw new Error(String(exhaustive));
      }
    }
  });
}

function claimedFields<T extends string>(claims: GroupableClaims<T>): T[] {
  return (Object.keys(claims) as T[]).filter((field) => claims[field]);
}
