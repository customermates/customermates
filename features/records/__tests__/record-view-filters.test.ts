import type { Filter } from "@/core/base/base-get.schema";
import type { DataViewState } from "@/core/data-view/data-view-state.schema";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { FilterOperatorKey as Operator } from "@/core/base/base-query-builder";
import { createCrmPreset, presetId } from "../crm-preset";
import {
  changedFilterCount,
  cleanRecordViewState,
  invalidRecordViewReference,
  liveRecordFilters,
  recordViewStateIsValid,
} from "../record-view-state";

const workspace = randomUUID();
const id = (key: string) => presetId(workspace, key);
const model = createCrmPreset(workspace);
const typeId = id("deal");
const stage = id("deal.stage");
const withoutWon = {
  ...model,
  fields: model.fields.map((field) =>
    field.id === stage
      ? { ...field, options: field.options.filter((option) => option.id !== id("deal.stage.won")) }
      : field,
  ),
};

describe("record view filters with deleted options", () => {
  it("drops option values that no longer exist and keeps the rest of the filter", () => {
    const valid: Filter = { field: stage, operator: Operator.in, value: [id("deal.stage.new")] };
    const filters: Filter[] = [
      valid,
      { field: stage, operator: Operator.notIn, value: [id("deal.stage.won"), id("deal.stage.lost")] },
      { field: stage, operator: Operator.in, value: [id("deal.stage.won")] },
    ];
    const live = liveRecordFilters(typeId, filters, withoutWon);
    expect(live).toEqual([valid, { field: stage, operator: Operator.notIn, value: [id("deal.stage.lost")] }]);
    expect(live[0]).toBe(valid);
    expect(recordViewStateIsValid(typeId, { filters: live }, withoutWon)).toBe(true);
    expect(changedFilterCount(filters, live)).toBe(2);
  });

  it("drops a link filter for an unknown option, an unknown field or an invalid value instead of failing", () => {
    const filters: Filter[] = [
      { field: stage, operator: Operator.in, value: ["00000000-0000-4000-8000-000000000000"] },
      { field: randomUUID(), operator: Operator.isNull },
      { field: "system:updatedAt", operator: Operator.equals, value: "not a date" },
      { field: "system:updatedAt", operator: Operator.inLastDays, value: 7 },
    ];
    expect(liveRecordFilters(typeId, filters, model)).toEqual([filters[3]]);
  });

  it("cleans a restored view whose filter option was deleted", () => {
    const state: DataViewState = {
      filters: [{ field: stage, operator: Operator.in, value: [id("deal.stage.won")] }],
      columnOrder: [stage],
    };
    expect(recordViewStateIsValid(typeId, state, withoutWon)).toBe(false);
    expect(cleanRecordViewState(typeId, state, withoutWon)).toEqual({ filters: [] });
  });

  it("names the deleted option a saved view still filters by", () => {
    const state: DataViewState = { filters: [{ field: stage, operator: Operator.in, value: [id("deal.stage.won")] }] };
    expect(invalidRecordViewReference(typeId, state, withoutWon, model)).toEqual({
      columnId: stage,
      columnLabel: "Won",
    });
  });
});
