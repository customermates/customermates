import { describe, expect, it } from "vitest";
import { getTranslator } from "@/i18n/get-translator";
import { APP_LOCALES } from "@/i18n/locale-registry";
import { createWorkspaceRecordPreset } from "../workspace-record-preset";
import { presetId } from "../crm-preset";
import { validateRecordModel } from "../record-model-validation";

describe("new workspace CRM templates", () => {
  it.each(APP_LOCALES)("seeds the existing defaults in %s", async (locale) => {
    const companyId = "860c8298-9054-4624-b5dc-87da2f2c6776";
    const translate = await getTranslator(locale);
    const model = createWorkspaceRecordPreset(companyId, "EUR", translate);
    const id = (key: string) => presetId(companyId, key);
    expect(validateRecordModel(model).issues).toEqual([]);
    expect(model.types.filter((type) => !type.embedded)).toHaveLength(5);
    expect(model.types.find((type) => type.embedded)?.parentRelationshipId).toBe(id("lineItem.deal"));
    const stage = model.fields.find((field) => field.id === id("deal.stage"));
    expect(stage?.options.map((option) => option.attributes[0]?.value)).toEqual(
      [10, 20, 40, 60, 80, 100, 0].map((value) => ({ kind: "decimal", value: String(value), currency: null })),
    );
    expect(stage?.behavior).toEqual({
      kind: "input",
      defaultValue: { kind: "select", value: id("deal.stage.prospecting") },
    });
    expect(stage?.label).toBe(translate("Common.defaultData.deal.columnLabel"));
    expect(model.fields.find((field) => field.id === id("task.status"))?.options).toHaveLength(6);
    expect(model.fields.find((field) => field.id === id("contact.status"))?.options).toHaveLength(6);
    expect(model.fields.find((field) => field.id === id("lineItem.name"))?.behavior).toEqual({
      kind: "input",
      defaultValue: { kind: "text", value: translate("RecordModel.lineItem") },
    });
    expect(model.fields.some((field) => field.publishedSummary)).toBe(false);
    expect(model.accessPresets).toEqual([]);
    expect(JSON.stringify(model)).not.toMatch(/RecordModel\.|Common\.|Terminology\./);
  });
});
