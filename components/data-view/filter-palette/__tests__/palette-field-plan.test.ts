import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { FilterableField } from "@/core/base/base-get.schema";
import type { PalettePageKind } from "../palette-field-plan";

import { describe, expect, it } from "vitest";

import { CustomColumnType, EntityType } from "@/generated/prisma";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FilterOperatorKey, isStandaloneOperator } from "@/core/base/base-query-builder";
import { PrismaCustomColumnRepo } from "@/features/custom-column/prisma-custom-column.repository";
import { resolveFilterValueClass } from "@/components/data-view/filter-modal/filter-value-class";

import { PALETTE_OPERATOR_PREFERENCE, palettePlan } from "../palette-field-plan";

type Expected = { impliedOperator: FilterOperatorKey | undefined; pageKind: PalettePageKind };

const CUSTOM_COLUMN_OPERATORS = new PrismaCustomColumnRepo().operatorsByType;

const CUSTOM_COLUMN_IDS: Record<CustomColumnType, string> = {
  [CustomColumnType.currency]: "11111111-1111-4111-8111-111111111111",
  [CustomColumnType.date]: "22222222-2222-4222-8222-222222222222",
  [CustomColumnType.dateRange]: "33333333-3333-4333-8333-333333333333",
  [CustomColumnType.dateTime]: "44444444-4444-4444-8444-444444444444",
  [CustomColumnType.dateTimeRange]: "55555555-5555-4555-8555-555555555555",
  [CustomColumnType.email]: "66666666-6666-4666-8666-666666666666",
  [CustomColumnType.link]: "77777777-7777-4777-8777-777777777777",
  [CustomColumnType.phone]: "88888888-8888-4888-8888-888888888888",
  [CustomColumnType.plain]: "99999999-9999-4999-8999-999999999999",
  [CustomColumnType.singleSelect]: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};

const STANDARD_FIELDS: FilterableField[] = Object.entries(FILTER_FIELD_DEFAULT_OPERATORS).map(([field, operators]) => ({
  field,
  operators,
}));

const CUSTOM_FIELDS: FilterableField[] = Object.entries(CUSTOM_COLUMN_OPERATORS).map(([type, operators]) => ({
  field: CUSTOM_COLUMN_IDS[type as CustomColumnType],
  operators,
}));

const CUSTOM_COLUMNS = Object.entries(CUSTOM_COLUMN_IDS).map(
  ([type, id]) =>
    ({
      id,
      label: type,
      entityType: EntityType.contact,
      type: type as CustomColumnType,
      options: [],
    }) as unknown as CustomColumnDto,
);

const FILTERABLE_FIELDS = [...STANDARD_FIELDS, ...CUSTOM_FIELDS];

const SELECT: Expected = { impliedOperator: FilterOperatorKey.in, pageKind: "select" };
const TEXT: Expected = { impliedOperator: FilterOperatorKey.contains, pageKind: "text" };
const RELATIVE_DATE: Expected = { impliedOperator: FilterOperatorKey.inLastDays, pageKind: "date" };
const OPERATOR_ONLY: Expected = { impliedOperator: undefined, pageKind: "operatorOnly" };

const EXPECTED_STANDARD: Record<FilterFieldKey, Expected> = {
  [FilterFieldKey.auditSource]: SELECT,
  [FilterFieldKey.calendarId]: SELECT,
  [FilterFieldKey.connectedAccountId]: SELECT,
  [FilterFieldKey.contactIds]: SELECT,
  [FilterFieldKey.createdAt]: RELATIVE_DATE,
  [FilterFieldKey.dealIds]: SELECT,
  [FilterFieldKey.event]: SELECT,
  [FilterFieldKey.googleAdsClickId]: OPERATOR_ONLY,
  [FilterFieldKey.isPlatformOperator]: SELECT,
  [FilterFieldKey.lastActiveAt]: RELATIVE_DATE,
  [FilterFieldKey.organizationIds]: SELECT,
  [FilterFieldKey.participantContactId]: SELECT,
  [FilterFieldKey.participants]: OPERATOR_ONLY,
  [FilterFieldKey.plan]: SELECT,
  [FilterFieldKey.provider]: SELECT,
  [FilterFieldKey.serviceIds]: SELECT,
  [FilterFieldKey.startsAt]: RELATIVE_DATE,
  [FilterFieldKey.state]: SELECT,
  [FilterFieldKey.status]: SELECT,
  [FilterFieldKey.subscriptionStatus]: SELECT,
  [FilterFieldKey.taskIds]: SELECT,
  [FilterFieldKey.timelineKind]: SELECT,
  [FilterFieldKey.timelineThreadId]: SELECT,
  [FilterFieldKey.updatedAt]: RELATIVE_DATE,
  [FilterFieldKey.url]: TEXT,
  [FilterFieldKey.userIds]: SELECT,
  [FilterFieldKey.workspaceId]: SELECT,
  [FilterFieldKey.workspaceTags]: SELECT,
};

const EXPECTED_CUSTOM: Record<CustomColumnType, Expected> = {
  [CustomColumnType.currency]: { impliedOperator: FilterOperatorKey.gte, pageKind: "number" },
  [CustomColumnType.date]: { impliedOperator: FilterOperatorKey.gte, pageKind: "date" },
  [CustomColumnType.dateRange]: { impliedOperator: FilterOperatorKey.contains, pageKind: "date" },
  [CustomColumnType.dateTime]: { impliedOperator: FilterOperatorKey.gte, pageKind: "date" },
  [CustomColumnType.dateTimeRange]: { impliedOperator: FilterOperatorKey.contains, pageKind: "date" },
  [CustomColumnType.email]: TEXT,
  [CustomColumnType.link]: TEXT,
  [CustomColumnType.phone]: TEXT,
  [CustomColumnType.plain]: TEXT,
  [CustomColumnType.singleSelect]: SELECT,
};

const planFor = (field: string) => palettePlan(field, FILTERABLE_FIELDS, CUSTOM_COLUMNS);

describe("palettePlan", () => {
  it("covers every declared filter field and every custom column type", () => {
    expect(Object.keys(EXPECTED_STANDARD).sort()).toEqual(Object.keys(FILTER_FIELD_DEFAULT_OPERATORS).sort());
    expect(Object.keys(EXPECTED_CUSTOM).sort()).toEqual(Object.keys(CUSTOM_COLUMN_OPERATORS).sort());
  });

  it("implies the operator and page the spec assigns to every standard field family", () => {
    for (const [field, expected] of Object.entries(EXPECTED_STANDARD)) {
      const plan = planFor(field);

      expect({ field, impliedOperator: plan.impliedOperator, pageKind: plan.pageKind }).toEqual({
        field,
        ...expected,
      });
    }
  });

  it("implies the operator and page the spec assigns to every custom column type", () => {
    for (const [type, expected] of Object.entries(EXPECTED_CUSTOM)) {
      const field = CUSTOM_COLUMN_IDS[type as CustomColumnType];
      const plan = planFor(field);

      expect({ type, impliedOperator: plan.impliedOperator, pageKind: plan.pageKind }).toEqual({ type, ...expected });
    }
  });

  it("only ever implies an operator the field itself declares", () => {
    for (const { field, operators } of FILTERABLE_FIELDS) {
      const { impliedOperator } = planFor(field);

      if (impliedOperator === undefined) {
        expect(operators.some((operator) => PALETTE_OPERATOR_PREFERENCE.includes(operator))).toBe(false);
        continue;
      }

      expect(operators).toContain(impliedOperator);
    }
  });

  it("keeps the page kind consistent with the value class of the implied operator", () => {
    for (const { field } of FILTERABLE_FIELDS) {
      const plan = planFor(field);

      expect(plan.valueClass).toBe(resolveFilterValueClass(field, plan.impliedOperator, CUSTOM_COLUMNS));
    }
  });

  it("offers only standalone operators the field declares, and every one of them", () => {
    for (const { field, operators } of FILTERABLE_FIELDS) {
      const { standaloneOperators } = planFor(field);

      expect(standaloneOperators).toEqual(operators.filter((operator) => isStandaloneOperator(operator)));
      expect(standaloneOperators.every((operator) => operators.includes(operator))).toBe(true);
    }
  });

  it("never implies a relative window on a custom date column, which cannot execute it", () => {
    for (const type of [CustomColumnType.date, CustomColumnType.dateTime]) {
      const field = CUSTOM_COLUMN_IDS[type];

      expect(CUSTOM_COLUMN_OPERATORS[type]).not.toContain(FilterOperatorKey.inLastDays);
      expect(planFor(field).impliedOperator).not.toBe(FilterOperatorKey.inLastDays);
    }
  });

  it("walks the preference in order, taking the first operator a field declares", () => {
    const cases: Array<{ operators: FilterOperatorKey[]; implied: FilterOperatorKey | undefined }> = [
      { operators: Object.values(FilterOperatorKey), implied: FilterOperatorKey.in },
      {
        operators: [
          FilterOperatorKey.contains,
          FilterOperatorKey.inLastDays,
          FilterOperatorKey.gte,
          FilterOperatorKey.equals,
        ],
        implied: FilterOperatorKey.contains,
      },
      {
        operators: [FilterOperatorKey.inLastDays, FilterOperatorKey.gte, FilterOperatorKey.equals],
        implied: FilterOperatorKey.inLastDays,
      },
      { operators: [FilterOperatorKey.gte, FilterOperatorKey.equals], implied: FilterOperatorKey.gte },
      { operators: [FilterOperatorKey.equals], implied: FilterOperatorKey.equals },
      { operators: [FilterOperatorKey.lt, FilterOperatorKey.notIn], implied: undefined },
    ];

    for (const { operators, implied } of cases) {
      const fields: FilterableField[] = [{ field: FilterFieldKey.status, operators }];

      expect(palettePlan(FilterFieldKey.status, fields).impliedOperator).toBe(implied);
    }
  });

  it("returns an unusable but safe plan for a field the surface does not declare", () => {
    const plan = palettePlan("unknownField", FILTERABLE_FIELDS, CUSTOM_COLUMNS);

    expect(plan).toEqual({
      impliedOperator: undefined,
      valueClass: "none",
      pageKind: "operatorOnly",
      standaloneOperators: [],
    });
  });
});
