import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import type { DataViewState } from "@/core/data-view/data-view-state.schema";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUser } from "@/tests/helpers/mock-user";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import { recordViewStateIsValid } from "@/features/records/record-view-state";

import { ViewTrashBlockers } from "../view-trash-blockers";

describe("restoring a saved record view", () => {
  const companyId = randomUUID();
  const user = createMockUser({ companyId });
  const typeId = presetId(companyId, "deal");
  const fieldId = presetId(companyId, "deal.stage");
  const viewId = randomUUID();
  const model = createCrmPreset(companyId);
  const archived = {
    ...model,
    fields: model.fields.map((field) => (field.id === fieldId ? { ...field, archived: true } : field)),
  };
  const state = {
    filters: [{ field: fieldId, operator: FilterOperatorKey.in, value: [presetId(companyId, "deal.stage.new")] }],
    columnOrder: [fieldId],
    sortDescriptor: { field: fieldId, direction: "asc" as const },
    grouping: { field: fieldId },
  } satisfies DataViewState;

  it("reports each setting removed when its field is still in Trash", async () => {
    expect(recordViewStateIsValid(typeId, state, model)).toBe(true);
    const rewriteViewStateCompanyWide = vi.fn().mockResolvedValue(undefined);
    const blockers = new ViewTrashBlockers(
      { getModel: () => Promise.resolve(archived) },
      {
        getRecordViewStatesByIds: () => Promise.resolve([{ id: viewId, typeId, state }]),
        rewriteViewStateCompanyWide,
      },
    );
    const dropped = await runWithTenant(user, () => blockers.restoreReferences([viewId]));
    expect(dropped).toEqual([{ viewId, filters: 1, columns: 1, sort: true, grouping: true }]);
    expect(rewriteViewStateCompanyWide).toHaveBeenCalledWith(companyId, viewId, {
      filters: [],
      columnOrder: [],
      sortDescriptor: null,
      grouping: null,
    });
  });

  it("removes a filter value whose option was deleted while the view was in Trash", async () => {
    const lost = presetId(companyId, "deal.stage.lost");
    const withoutNew = {
      ...model,
      fields: model.fields.map((field) =>
        field.id === fieldId
          ? { ...field, options: field.options.filter((option) => option.id !== presetId(companyId, "deal.stage.new")) }
          : field,
      ),
    };
    const stale = {
      filters: [
        { field: fieldId, operator: FilterOperatorKey.in, value: [presetId(companyId, "deal.stage.new"), lost] },
      ],
    } satisfies DataViewState;
    const rewriteViewStateCompanyWide = vi.fn().mockResolvedValue(undefined);
    const blockers = new ViewTrashBlockers(
      { getModel: () => Promise.resolve(withoutNew) },
      {
        getRecordViewStatesByIds: () => Promise.resolve([{ id: viewId, typeId, state: stale }]),
        rewriteViewStateCompanyWide,
      },
    );
    const dropped = await runWithTenant(user, () => blockers.restoreReferences([viewId]));
    expect(dropped).toEqual([{ viewId, filters: 1, columns: 0, sort: false, grouping: false }]);
    expect(rewriteViewStateCompanyWide).toHaveBeenCalledWith(companyId, viewId, {
      filters: [{ field: fieldId, operator: FilterOperatorKey.in, value: [lost] }],
    });
  });

  it("keeps every setting when the field was restored first", async () => {
    const rewriteViewStateCompanyWide = vi.fn();
    const blockers = new ViewTrashBlockers(
      { getModel: () => Promise.resolve(model) },
      {
        getRecordViewStatesByIds: () => Promise.resolve([{ id: viewId, typeId, state }]),
        rewriteViewStateCompanyWide,
      },
    );
    expect(await runWithTenant(user, () => blockers.restoreReferences([viewId]))).toEqual([]);
    expect(rewriteViewStateCompanyWide).not.toHaveBeenCalled();
  });
});
