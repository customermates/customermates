import type { Data } from "@/core/validation/validation.utils";
import type { DateBucket } from "./grouping.schema";

import { z } from "zod";

import { FilterFieldKey } from "@/core/types/filter-field-key";
import { AUDIT_SOURCE_FILTER_VALUES } from "@/core/types/filter-field-value-kind";
import { Status, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";
import { DATE_BUCKETS, GroupingSchema } from "./grouping.schema";

export const OPERATOR_GROUPABLE_MODELS = ["user", "company", "operatorAudit"] as const;
export const AUTOMATION_GROUPABLE_MODELS = ["routine"] as const;
export const GROUPABLE_MODELS = [...OPERATOR_GROUPABLE_MODELS, ...AUTOMATION_GROUPABLE_MODELS] as const;
export type OperatorGroupableModel = (typeof OPERATOR_GROUPABLE_MODELS)[number];
export type GroupableModel = (typeof GROUPABLE_MODELS)[number];
export type GroupingKind = "customSingleSelect" | "enum" | "relation" | "dateBucket";

export type EnumWiring = {
  column: string;
  values: readonly string[];
  nullable: boolean;
  labelKey: string;
  valueLabelKey: (value: string) => string;
};

export const GROUPING_RELATIONS = {
  user: {},
  company: {},
  operatorAudit: {},
  routine: { ownerUserId: true },
} satisfies Record<GroupableModel, Readonly<Partial<Record<FilterFieldKey, true>>>>;

const SUBSCRIPTION_PLAN_WIRING: EnumWiring = {
  column: "plan",
  values: Object.values(SubscriptionPlan),
  nullable: true,
  labelKey: "Common.table.columns.plan",
  valueLabelKey: (value: string) => `Subscription.planNames.${value}`,
};

const SUBSCRIPTION_STATUS_WIRING: EnumWiring = {
  column: "subscriptionStatus",
  values: Object.values(SubscriptionStatus),
  nullable: true,
  labelKey: "Common.table.columns.subscription",
  valueLabelKey: (value: string) => `Subscription.status.${value}`,
};

export const GROUPING_ENUM = {
  user: {
    status: {
      column: "status",
      values: Object.values(Status),
      nullable: false,
      labelKey: "Common.table.columns.status",
      valueLabelKey: (value: string) => `Common.userStatuses.${value}`,
    },
    plan: SUBSCRIPTION_PLAN_WIRING,
    subscriptionStatus: SUBSCRIPTION_STATUS_WIRING,
  },
  company: {
    plan: SUBSCRIPTION_PLAN_WIRING,
    subscriptionStatus: SUBSCRIPTION_STATUS_WIRING,
  },
  operatorAudit: {
    auditSource: {
      column: "auditSource",
      values: AUDIT_SOURCE_FILTER_VALUES,
      nullable: false,
      labelKey: "Common.filters.fields.auditSource",
      valueLabelKey: (value: string) => `OperatorAudit.values.source.${value}`,
    },
  },
  routine: {},
} satisfies Record<GroupableModel, Readonly<Record<string, EnumWiring>>>;

export const GROUPABLE_DATE_FIELDS = [FilterFieldKey.createdAt, FilterFieldKey.updatedAt] as const;

export type GroupableRelationField<M extends GroupableModel> = keyof (typeof GROUPING_RELATIONS)[M] & string;
export type GroupableEnumField<M extends GroupableModel> = keyof (typeof GROUPING_ENUM)[M] & string;
export type GroupableDateField = (typeof GROUPABLE_DATE_FIELDS)[number];

export type GroupableClaims<T extends string> = Record<T, boolean>;

type SpecBase = { field: string; model: GroupableModel };

export type GroupableFieldSpec =
  | (SpecBase & {
      kind: "enum";
      column: string;
      values: readonly string[];
      nullable: boolean;
      labelKey: string;
      valueLabelKey: (value: string) => string;
    })
  | (SpecBase & { kind: "relation"; labelKey: string })
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

export function relationGroupable<M extends GroupableModel>(args: {
  model: M;
  field: GroupableRelationField<M>;
}): GroupableFieldSpec {
  if (!(GROUPING_RELATIONS[args.model] as Record<string, true | undefined>)[args.field])
    throw new Error(`No grouping relation declared for ${args.model}.${args.field}`);

  return {
    kind: "relation",
    field: args.field,
    model: args.model,
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
