import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { SummableModel } from "@/core/base/base-repository";
import type {
  GroupableFieldSpec,
  GroupableModel,
  GroupableRelationField,
  GroupingTargetModel,
} from "../groupable-field";

import { describe, expect, it } from "vitest";

import { CustomColumnType, EntityType } from "@/generated/prisma";

import {
  GROUPABLE_DATE_FIELDS,
  GROUPABLE_MODELS,
  GROUPABLE_MODEL_BY_ENTITY_TYPE,
  GROUPING_ENUM,
  GROUPING_JOIN,
  customSelectGroupables,
  dateGroupables,
  enumGroupable,
  enumGroupables,
  groupableFieldDtos,
  relationGroupable,
  relationGroupables,
} from "../groupable-field";

const A_COLUMN_ID = "8f1c1a4e-0b2d-4a9e-9d7c-1f2a3b4c5d6e";
const ANOTHER_COLUMN_ID = "8f1c1a4e-0b2d-4a9e-9d7c-1f2a3b4c5d6f";

type TargetIsSummable = GroupingTargetModel extends SummableModel ? true : never;
const TARGET_MODELS_ARE_SUMMABLE: TargetIsSummable = true;

const DEAL_RELATION_CLAIMS: Record<GroupableRelationField<"deal">, boolean> = {
  contactIds: true,
  organizationIds: true,
  serviceIds: true,
  taskIds: true,
  userIds: true,
};

function singleSelect(id: string, entityType: EntityType, label: string): CustomColumnDto {
  return {
    id,
    label,
    entityType,
    type: CustomColumnType.singleSelect,
    options: { options: [{ value: "won", label: "Won", color: "success", isDefault: false, index: 0 }] },
  };
}

describe("grouping wiring registries", () => {
  it("wires every groupable model, and only models the query engine can sum over", () => {
    expect(TARGET_MODELS_ARE_SUMMABLE).toBe(true);
    expect(Object.keys(GROUPING_JOIN).sort()).toEqual([...GROUPABLE_MODELS].sort());
    expect(Object.keys(GROUPING_ENUM).sort()).toEqual([...GROUPABLE_MODELS].sort());
    expect(Object.values(GROUPABLE_MODEL_BY_ENTITY_TYPE).sort()).toEqual([...GROUPABLE_MODELS].sort());
    expect(Object.keys(GROUPABLE_MODEL_BY_ENTITY_TYPE).sort()).toEqual(Object.values(EntityType).sort());
  });

  it("names a join model, key column and target for every wired relation", () => {
    for (const [model, relations] of Object.entries(GROUPING_JOIN)) {
      for (const [field, wiring] of Object.entries(relations)) {
        expect([model, field, wiring.collection.length > 0]).toEqual([model, field, true]);
        expect([model, field, wiring.joinModel.length > 0]).toEqual([model, field, true]);
        expect([model, field, wiring.keyColumn.endsWith("Id")]).toEqual([model, field, true]);
        expect([model, field, wiring.parentRelation]).toEqual([model, field, model]);
        expect([model, field, GROUPABLE_MODELS.includes(wiring.targetModel as GroupableModel)]).toEqual([
          model,
          field,
          wiring.targetModel !== "user",
        ]);
      }
    }
  });

  it("declares a non empty value set and a label key for every wired enum", () => {
    for (const [model, enums] of Object.entries(GROUPING_ENUM)) {
      for (const [field, wiring] of Object.entries(enums)) {
        expect([model, field, wiring.values.length > 0]).toEqual([model, field, true]);
        expect([model, field, wiring.labelKey.length > 0]).toEqual([model, field, true]);
        expect([model, field, wiring.valueLabelKey(wiring.values[0])]).toEqual([
          model,
          field,
          `Common.taskTypes.${wiring.values[0]}`,
        ]);
      }
    }
  });
});

describe("relation groupables", () => {
  it("builds a spec from the wiring rather than from the call site", () => {
    expect(relationGroupable({ model: "deal", field: "userIds" })).toEqual({
      kind: "relation",
      field: "userIds",
      model: "deal",
      collection: "users",
      joinModel: "dealUser",
      keyColumn: "userId",
      parentRelation: "deal",
      targetModel: "user",
      targetRelation: "user",
      labelKey: "Common.filters.fields.userIds",
    });
  });

  it("throws for a relation the map does not wire", () => {
    expect(() =>
      relationGroupable({ model: "service", field: "contactIds" as GroupableRelationField<"service"> }),
    ).toThrow("No grouping join wired for service.contactIds");
  });

  it("emits only the claimed relations and claims every wired relation of the model", () => {
    const emitted = relationGroupables("deal", { ...DEAL_RELATION_CLAIMS, taskIds: false }).map(({ field }) => field);

    expect(emitted.sort()).toEqual(["contactIds", "organizationIds", "serviceIds", "userIds"]);
    expect(Object.keys(DEAL_RELATION_CLAIMS).sort()).toEqual(Object.keys(GROUPING_JOIN.deal).sort());
    expect(relationGroupables("deal", { ...DEAL_RELATION_CLAIMS, userIds: false, taskIds: false })).toHaveLength(3);
  });
});

describe("custom single select groupables", () => {
  it("keeps a foreign entity type out, which is what closes the multi entity surface hole", () => {
    const specs = customSelectGroupables(EntityType.deal, [
      singleSelect(A_COLUMN_ID, EntityType.deal, "Stage"),
      singleSelect(ANOTHER_COLUMN_ID, EntityType.task, "Task status"),
      { id: "plain", label: "Notes", entityType: EntityType.deal, type: CustomColumnType.plain },
    ]);

    expect(specs).toEqual([
      {
        kind: "customSingleSelect",
        field: A_COLUMN_ID,
        model: "deal",
        columnId: A_COLUMN_ID,
        entityType: EntityType.deal,
        label: "Stage",
        options: [{ value: "won", label: "Won", color: "success", isDefault: false, index: 0 }],
      },
    ]);
  });
});

describe("enum and date groupables", () => {
  it("emits nothing for a model with no wired enum and throws for an unwired enum field", () => {
    expect(enumGroupables("deal", {})).toEqual([]);
    expect(() => enumGroupable({ model: "deal", field: "type" as never })).toThrow(
      "No grouping enum wired for deal.type",
    );
  });

  it("builds the task type enum from its wiring", () => {
    expect(enumGroupables("task", { type: true })).toEqual([
      {
        kind: "enum",
        field: "type",
        model: "task",
        column: "type",
        values: GROUPING_ENUM.task.type.values,
        nullable: false,
        labelKey: "Common.table.columns.type",
        valueLabelKey: GROUPING_ENUM.task.type.valueLabelKey,
      },
    ]);
  });

  it("offers both date columns with all three buckets", () => {
    const specs = dateGroupables("task", { createdAt: true, updatedAt: false });

    expect(specs.map(({ field }) => field)).toEqual(["createdAt"]);
    expect(specs[0]).toMatchObject({ kind: "dateBucket", column: "createdAt", buckets: ["day", "week", "month"] });
    expect([...GROUPABLE_DATE_FIELDS]).toEqual(["createdAt", "updatedAt"]);
  });
});

describe("groupableFieldDtos", () => {
  it("expands a date spec into one entry per bucket and keeps every other kind single", () => {
    const dtos = groupableFieldDtos([
      ...customSelectGroupables(EntityType.deal, [singleSelect(A_COLUMN_ID, EntityType.deal, "Stage")]),
      relationGroupable({ model: "deal", field: "userIds" }),
      ...dateGroupables("deal", { createdAt: true, updatedAt: false }),
    ]);

    expect(dtos).toEqual([
      {
        id: A_COLUMN_ID,
        grouping: { field: A_COLUMN_ID },
        kind: "customSingleSelect",
        label: "Stage",
        supportsDragWriteBack: true,
      },
      {
        id: "userIds",
        grouping: { field: "userIds" },
        kind: "relation",
        labelKey: "Common.filters.fields.userIds",
        supportsDragWriteBack: false,
      },
      {
        id: "createdAt:day",
        grouping: { field: "createdAt", bucket: "day" },
        kind: "dateBucket",
        labelKey: "Common.filters.fields.createdAt",
        bucket: "day",
        supportsDragWriteBack: false,
      },
      {
        id: "createdAt:week",
        grouping: { field: "createdAt", bucket: "week" },
        kind: "dateBucket",
        labelKey: "Common.filters.fields.createdAt",
        bucket: "week",
        supportsDragWriteBack: false,
      },
      {
        id: "createdAt:month",
        grouping: { field: "createdAt", bucket: "month" },
        kind: "dateBucket",
        labelKey: "Common.filters.fields.createdAt",
        bucket: "month",
        supportsDragWriteBack: false,
      },
    ]);
  });

  it("throws through the exhaustive branch when a fifth kind reaches it", () => {
    const unknown = { kind: "histogram", field: "amount", model: "deal" } as unknown as GroupableFieldSpec;

    expect(() => groupableFieldDtos([unknown])).toThrow();
  });
});
