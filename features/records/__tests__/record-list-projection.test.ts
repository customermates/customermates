import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ViewMode } from "@/core/base/base-query-builder";
import { createCrmPreset, presetId } from "../crm-preset";
import { recordColumns } from "../record-columns";
import { recordListProjection } from "../record-list-projection";
import { relationshipColumnKey, relationshipPathColumnKey } from "../record-column.schema";

const companyId = randomUUID();
const id = (key: string) => presetId(companyId, key);
const model = createCrmPreset(companyId);
const typeId = id("deal");
const hiddenColumns = recordColumns(typeId, model).map((column) => column.id);
const state = { hiddenColumns, viewMode: ViewMode.table };

describe("record list projection", () => {
  it("always includes the title, and omits hidden values without removing definitions", () => {
    expect(recordListProjection(typeId, model, state)).toEqual({
      fields: [id("deal.name")],
      includeRelationships: [],
      includePaths: [],
      includeIdentities: false,
    });
    expect(model.fields.some((field) => field.id === id("deal.notes"))).toBe(true);
  });

  it("includes visible values and the current grouping field on both tables and boards", () => {
    for (const viewMode of [ViewMode.table, ViewMode.card]) {
      const projected = recordListProjection(typeId, model, {
        ...state,
        viewMode,
        hiddenColumns: hiddenColumns.filter((key) => key !== id("deal.notes")),
        grouping: { field: id("deal.stage") },
      });
      expect(new Set(projected.fields)).toEqual(new Set([id("deal.name"), id("deal.stage"), id("deal.notes")]));
    }
  });

  it("uses current columns before preferences finish saving and ignores stale column IDs", () => {
    const relationship = relationshipColumnKey(id("deal.organizations"), "outgoing");
    const projected = recordListProjection(typeId, model, state, [id("deal.notes"), relationship, randomUUID()]);
    expect(projected.fields).toEqual([id("deal.name"), id("deal.notes")]);
    expect(projected.includeRelationships).toEqual([
      { relationId: id("deal.organizations"), direction: "outgoing", limit: 10 },
    ]);
  });

  it("includes calendar dates and color even when their columns are hidden", () => {
    const date = {
      ...model.fields[0],
      id: randomUUID(),
      typeId,
      valueType: "date" as const,
      behavior: { kind: "input" as const },
      multiple: false,
      archived: false,
    };
    const projected = recordListProjection(
      typeId,
      { ...model, fields: [...model.fields, date] },
      {
        ...state,
        hiddenColumns: [...hiddenColumns, date.id],
        viewMode: ViewMode.calendar,
        calendar: { dateFieldId: date.id, colorFieldId: id("deal.stage"), mode: "month" },
      },
    );
    expect(new Set(projected.fields)).toEqual(new Set([id("deal.name"), date.id, id("deal.stage")]));
  });

  it("includes the avatar and contact details separately from ordinary field values", () => {
    const contact = id("contact");
    const columns = recordColumns(contact, model);
    const projected = recordListProjection(contact, model, {
      hiddenColumns: columns.filter((column) => column.id !== id("capability.identity")).map((column) => column.id),
      viewMode: ViewMode.table,
    });
    const avatar = model.capabilities
      .find((binding) => binding.kind === "avatar" && binding.typeId === contact)
      ?.fields.find((field) => field.role === "image")?.fieldId;
    expect(avatar).toBeDefined();
    expect(projected.fields).toContain(avatar);
    expect(projected.fields).not.toContain(id("capability.identity"));
    expect(projected.includeIdentities).toBe(true);
  });

  it("projects declared relationship paths and excludes archived fields and other lists", () => {
    const pathId = randomUUID();
    const extended = {
      ...model,
      types: model.types.map((type) =>
        type.id === typeId
          ? {
              ...type,
              relationshipPaths: [
                {
                  id: pathId,
                  label: "Organizations",
                  path: [{ relationId: id("deal.organizations"), direction: "outgoing" as const }],
                  archived: false,
                },
              ],
            }
          : type,
      ),
      fields: model.fields.map((field) => (field.id === id("deal.notes") ? { ...field, archived: true } : field)),
    };
    const projected = recordListProjection(typeId, extended, state, [
      relationshipPathColumnKey(pathId),
      id("deal.notes"),
      id("contact.name"),
    ]);
    expect(projected.fields).toEqual([id("deal.name")]);
    expect(projected.includePaths).toEqual([{ pathId, limit: 10 }]);
  });
});
