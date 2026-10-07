import { describe, expect, it } from "vitest";

import type { RecordModel } from "../record-model.schema";

import { createCrmPreset, presetId } from "../crm-preset";
import { duplicateNameIssues, recordNameKey } from "../record-names";

const companyId = "860c8298-9054-4624-b5dc-87da2f2c6776";
const id = (key: string) => presetId(companyId, key);

function changed(edit: (model: RecordModel) => void, before: (model: RecordModel) => void = () => {}) {
  const previous = createCrmPreset(companyId);
  before(previous);
  const model = structuredClone(previous);
  edit(model);
  return duplicateNameIssues(model, previous);
}

const field = (model: RecordModel, key: string) => {
  const found = model.fields.find((candidate) => candidate.id === id(key));
  if (!found) throw new Error(key);
  return found;
};
const type = (model: RecordModel, key: string) => {
  const found = model.types.find((candidate) => candidate.id === id(key));
  if (!found) throw new Error(key);
  return found;
};

describe("unique configuration names", () => {
  it("compares names without surrounding or repeated spaces, case or accents", () => {
    expect(recordNameKey("  Café   Name ")).toBe(recordNameKey("cafe name"));
    expect(recordNameKey("Tâche")).toBe(recordNameKey("TACHE"));
    expect(recordNameKey("Deal")).not.toBe(recordNameKey("Deals"));
  });

  it("refuses a list name used by another list's singular or plural, and allows a list's own singular as plural", () => {
    expect(
      changed((model) => {
        type(model, "deal").label = " organizations ";
      }),
    ).toEqual([{ code: "duplicate_list_name", typeId: id("deal") }]);
    expect(
      changed((model) => {
        type(model, "task").pluralLabel = type(model, "task").label;
      }),
    ).toEqual([]);
  });

  it("refuses a field name used in the same list, deleted fields included, and allows it in another list", () => {
    expect(
      changed((model) => {
        field(model, "contact.notes").label = "FIRST NAME";
      }),
    ).toEqual([{ code: "duplicate_field_name", fieldId: id("contact.notes"), typeId: id("contact") }]);
    expect(
      changed(
        (model) => {
          field(model, "contact.notes").label = "Avatar";
        },
        (model) => {
          field(model, "contact.avatarUrl").archived = true;
        },
      ),
    ).toEqual([{ code: "duplicate_field_name", fieldId: id("contact.notes"), typeId: id("contact") }]);
    expect(
      changed((model) => {
        field(model, "deal.notes").label = "First name";
      }),
    ).toEqual([]);
  });

  it("refuses an option label repeated within a field", () => {
    expect(
      changed((model) => {
        const stage = field(model, "deal.stage");
        stage.options[1] = { ...stage.options[1], label: ` ${stage.options[0].label.toUpperCase()}` };
      }),
    ).toEqual([{ code: "duplicate_option_label", fieldId: id("deal.stage"), typeId: id("deal") }]);
  });

  it("refuses a relationship label repeated on the same list side and lets a self-relationship repeat its own label", () => {
    expect(
      changed((model) => {
        const service = model.relationships.find((relation) => relation.id === id("lineItem.service"));
        const deal = model.relationships.find((relation) => relation.id === id("lineItem.deal"));
        if (!service || !deal) throw new Error("fixture");
        service.sourceLabel = deal.sourceLabel.toLowerCase();
      }),
    ).toEqual([{ code: "duplicate_relationship_label", relationId: id("lineItem.service") }]);
    expect(
      changed((model) => {
        model.relationships.push({
          ...model.relationships[0],
          id: "6b1f9c58-3f4d-4f7a-9a43-0d9e7a2f1c11",
          sourceTypeId: id("contact"),
          targetTypeId: id("contact"),
          sourceLabel: "Referrals",
          targetLabel: "Referrals",
        });
      }),
    ).toEqual([]);
  });

  it("does not report duplicates the change did not touch", () => {
    const previous = createCrmPreset(companyId);
    field(previous, "contact.notes").label = "First name";
    const model = structuredClone(previous);
    type(model, "deal").description = "Changed";
    expect(duplicateNameIssues(model, previous)).toEqual([]);
  });
});
