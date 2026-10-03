import { describe, expect, it } from "vitest";
import { canonicalRecordJson } from "../record-json";
import { createCrmPreset, presetId } from "../crm-preset";
import { RecordModelSchema } from "../record-model.schema";
import { calculationDependencyHash } from "../configuration.service";
import { fieldValueDefinition } from "../record-configuration-values";
import { recordInvariant } from "../record-invariant";

describe("record configuration fingerprints", () => {
  it("ignores object key order while preserving array order and null distinctions", () => {
    expect(canonicalRecordJson({ b: { y: 2, x: 1 }, a: [2, 1] })).toBe(
      canonicalRecordJson({ a: [2, 1], b: { x: 1, y: 2 } }),
    );
    expect(canonicalRecordJson({ a: [2, 1] })).not.toBe(canonicalRecordJson({ a: [1, 2] }));
    expect(canonicalRecordJson({ a: null })).not.toBe(canonicalRecordJson({}));
  });

  it("keeps approval fingerprints stable through schema parsing, JSON storage and option reordering", () => {
    const model = createCrmPreset("workspace", "EUR");
    const fieldId = presetId("workspace", "deal.weightedValue");
    const field = recordInvariant(model.fields.find((field) => field.id === fieldId));
    const hash = calculationDependencyHash(field, model);
    const stored = RecordModelSchema.parse(JSON.parse(canonicalRecordJson(model)));
    stored.fields.reverse();
    for (const field of stored.fields) field.options.reverse();
    expect(
      calculationDependencyHash(recordInvariant(stored.fields.find((field) => field.id === fieldId)), stored),
    ).toBe(hash);
    const stage = recordInvariant(stored.fields.find((field) => field.id === presetId("workspace", "deal.stage")));
    stage.options[0].attributes[0].value = { kind: "decimal", value: "42", currency: null };
    expect(
      calculationDependencyHash(recordInvariant(stored.fields.find((field) => field.id === fieldId)), stored),
    ).not.toBe(hash);
  });

  it("recalculates visibility dependencies when summary publication changes", () => {
    const field = recordInvariant(
      createCrmPreset("workspace", "EUR").fields.find((field) => field.behavior.kind === "rollup"),
    );
    expect(fieldValueDefinition(field)).not.toBe(fieldValueDefinition({ ...field, publishedSummary: true }));
  });
});
