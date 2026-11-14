import { describe, expect, it } from "vitest";

import { buildFormAnswers } from "../public-form-answers";
import { formFieldOptions, formPeopleLists, invalidFormConfigPaths } from "../public-form-config-validation";
import { isFormEligibleField } from "../public-form-fields";
import { presentPublicForm } from "../public-form-presentation";
import {
  AGREE_FIELD,
  CONTACT_FIELD,
  FORMULA_FIELD,
  NAME_FIELD,
  NOTES_FIELD,
  PEOPLE_TYPE_ID,
  PERSON_NAME_FIELD,
  RELATION_ID,
  SIZE_FIELD,
  SOURCE_FIELD,
  TYPE_ID,
  createConfig,
  createModel,
} from "./public-form-fixtures";

const model = createModel();

function build(answers: Record<string, string | string[] | boolean>, extra: { email?: string; name?: string } = {}) {
  const config = createConfig({
    fields: [
      { fieldId: NAME_FIELD, label: "Name", helpText: null, required: true },
      { fieldId: NOTES_FIELD, label: "Message", helpText: null, required: false },
      { fieldId: SOURCE_FIELD, label: "Source", helpText: null, required: false },
      { fieldId: AGREE_FIELD, label: "Agreed", helpText: null, required: false },
      { fieldId: SIZE_FIELD, label: "Team size", helpText: null, required: false },
      { fieldId: CONTACT_FIELD, label: "Email", helpText: null, required: false },
    ],
  });
  return buildFormAnswers(config, TYPE_ID, model.fields, { answers, ...extra });
}

describe("buildFormAnswers", () => {
  it("converts each supported field type into a typed record value", () => {
    const result = build({
      [NAME_FIELD]: "  Ada Lovelace ",
      [NOTES_FIELD]: "First line\n\nSecond line",
      [SOURCE_FIELD]: "web",
      [AGREE_FIELD]: true,
      [SIZE_FIELD]: "12,5",
      [CONTACT_FIELD]: "  Ada@Example.COM ",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fields).toEqual([
      { fieldId: NAME_FIELD, value: { kind: "text", value: "Ada Lovelace" } },
      {
        fieldId: NOTES_FIELD,
        value: {
          kind: "richText",
          documentJson: JSON.stringify({
            type: "doc",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "First line" }] },
              { type: "paragraph", content: [{ type: "text", text: "Second line" }] },
            ],
          }),
        },
      },
      { fieldId: SOURCE_FIELD, value: { kind: "select", value: "web" } },
      { fieldId: AGREE_FIELD, value: { kind: "boolean", value: true } },
      { fieldId: SIZE_FIELD, value: { kind: "decimal", value: "12.5", currency: null } },
    ]);
    expect(result.identities).toEqual([{ provider: "mail", value: "ada@example.com" }]);
    expect(result.display[SOURCE_FIELD]).toBe("Website");
  });

  it("requires what the form or the list marks as required", () => {
    const result = build({ [NAME_FIELD]: "   " });

    expect(result).toEqual({ ok: false, errors: { [NAME_FIELD]: "required" } });
  });

  it("treats an unchecked required yes/no field as missing", () => {
    const config = createConfig({
      fields: [
        { fieldId: NAME_FIELD, label: "Name", helpText: null, required: true },
        { fieldId: AGREE_FIELD, label: "Agreed", helpText: null, required: true },
      ],
    });

    const result = buildFormAnswers(config, TYPE_ID, model.fields, {
      answers: { [NAME_FIELD]: "Ada", [AGREE_FIELD]: false },
    });

    expect(result).toEqual({ ok: false, errors: { [AGREE_FIELD]: "required" } });
  });

  it("flags values that do not fit their field", () => {
    const result = build({
      [NAME_FIELD]: "Ada",
      [SOURCE_FIELD]: "not-an-option",
      [SIZE_FIELD]: "twelve",
      [CONTACT_FIELD]: "not an email",
    });

    expect(result).toEqual({
      ok: false,
      errors: { [SOURCE_FIELD]: "invalid", [SIZE_FIELD]: "invalid", [CONTACT_FIELD]: "email" },
    });
  });

  it("rejects an answer longer than the limit", () => {
    expect(build({ [NAME_FIELD]: "a".repeat(5_001) })).toEqual({ ok: false, errors: { [NAME_FIELD]: "invalid" } });
  });

  it("ignores answers to fields the form does not ask and fields that are no longer usable", () => {
    const config = createConfig({
      fields: [
        { fieldId: NAME_FIELD, label: "Name", helpText: null, required: true },
        { fieldId: FORMULA_FIELD, label: "Calculated", helpText: null, required: false },
      ],
    });

    const result = buildFormAnswers(config, TYPE_ID, model.fields, {
      answers: { [NAME_FIELD]: "Ada", [FORMULA_FIELD]: "tampered", [NOTES_FIELD]: "not asked" },
    });

    expect(result.ok && result.fields.map((entry) => entry.fieldId)).toEqual([NAME_FIELD]);
  });

  it("collects the person's email and name when the form links a person", () => {
    const config = createConfig({
      fields: [{ fieldId: NAME_FIELD, label: "Name", helpText: null, required: true }],
      person: {
        typeId: PEOPLE_TYPE_ID,
        relationshipId: RELATION_ID,
        emailLabel: "Email",
        nameLabel: "Your name",
        nameFieldId: PERSON_NAME_FIELD,
      },
    });

    const ok = buildFormAnswers(config, TYPE_ID, model.fields, {
      answers: { [NAME_FIELD]: "Ada" },
      email: " Ada@Example.com ",
      name: "Ada Lovelace",
    });
    expect(ok.ok && { email: ok.email, name: ok.name }).toEqual({ email: "ada@example.com", name: "Ada Lovelace" });

    expect(buildFormAnswers(config, TYPE_ID, model.fields, { answers: { [NAME_FIELD]: "Ada" } })).toEqual({
      ok: false,
      errors: { email: "required" },
    });
    expect(
      buildFormAnswers(config, TYPE_ID, model.fields, { answers: { [NAME_FIELD]: "Ada" }, email: "nope" }),
    ).toEqual({ ok: false, errors: { email: "email" } });
  });

  it("supports a multiple choice field with option ids", () => {
    const multiple = createModel();
    const source = multiple.fields.find((entry) => entry.id === SOURCE_FIELD);
    if (source) source.multiple = true;
    const config = createConfig({
      fields: [{ fieldId: SOURCE_FIELD, label: "Source", helpText: null, required: true }],
    });

    expect(
      buildFormAnswers(config, TYPE_ID, multiple.fields, { answers: { [SOURCE_FIELD]: ["web", "event", "web"] } }),
    ).toMatchObject({ ok: true, fields: [{ value: { kind: "selectList", value: ["web", "event"] } }] });
    expect(buildFormAnswers(config, TYPE_ID, multiple.fields, { answers: { [SOURCE_FIELD]: [] } })).toEqual({
      ok: false,
      errors: { [SOURCE_FIELD]: "required" },
    });
  });
});

describe("form field eligibility", () => {
  it("offers input fields of the supported types, in list order", () => {
    expect(formFieldOptions(model, TYPE_ID).map((entry) => entry.fieldId)).toEqual([
      NAME_FIELD,
      NOTES_FIELD,
      SOURCE_FIELD,
      AGREE_FIELD,
      SIZE_FIELD,
      CONTACT_FIELD,
    ]);
    expect(formFieldOptions(model, TYPE_ID).find((entry) => entry.fieldId === SOURCE_FIELD)?.options).toEqual([
      { id: "web", label: "Website" },
      { id: "event", label: "Event" },
    ]);
  });

  it("leaves out calculated, archived and unsupported fields", () => {
    const formula = model.fields.find((entry) => entry.id === FORMULA_FIELD);
    const archived = { ...model.fields[0], archived: true };
    const file = { ...model.fields[0], valueType: "file" as const };
    const multipleText = { ...model.fields[0], multiple: true };

    expect(formula && isFormEligibleField(formula)).toBe(false);
    expect(isFormEligibleField(archived)).toBe(false);
    expect(isFormEligibleField(file)).toBe(false);
    expect(isFormEligibleField(multipleText)).toBe(false);
  });

  it("lists the people lists a form can link, with their name fields", () => {
    expect(formPeopleLists(model, TYPE_ID)).toEqual([
      {
        typeId: PEOPLE_TYPE_ID,
        label: "People",
        relationships: [{ id: RELATION_ID, sourceLabel: "Leads", targetLabel: "Person" }],
        nameFields: [{ fieldId: PERSON_NAME_FIELD, label: "Full name", primary: true }],
      },
    ]);
  });

  it("names the config paths that point at unusable fields or people links", () => {
    expect(invalidFormConfigPaths(createConfig(), model, TYPE_ID)).toEqual([]);
    expect(
      invalidFormConfigPaths(
        createConfig({ fields: [{ fieldId: FORMULA_FIELD, label: "Calculated", helpText: null, required: false }] }),
        model,
        TYPE_ID,
      ),
    ).toEqual(["config.fields.0.fieldId"]);
    expect(
      invalidFormConfigPaths(
        createConfig({
          person: {
            typeId: TYPE_ID,
            relationshipId: RELATION_ID,
            emailLabel: "Email",
            nameLabel: null,
            nameFieldId: null,
          },
        }),
        model,
        TYPE_ID,
      ),
    ).toEqual(["config.person.typeId"]);
    expect(
      invalidFormConfigPaths(
        createConfig({
          person: {
            typeId: PEOPLE_TYPE_ID,
            relationshipId: "00000000-0000-4000-8000-0000000000ff",
            emailLabel: "Email",
            nameLabel: null,
            nameFieldId: NAME_FIELD,
          },
        }),
        model,
        TYPE_ID,
      ),
    ).toEqual(["config.person.relationshipId", "config.person.nameFieldId"]);
  });
});

describe("presentPublicForm", () => {
  it("shows only the configured questions and never leaks other fields or ids of the list", () => {
    const view = presentPublicForm({
      config: createConfig(),
      typeId: TYPE_ID,
      modelFields: model.fields,
      workspaceName: "Acme",
      badge: true,
      renderToken: "token",
    });

    expect(view.fields.map((entry) => entry.fieldId)).toEqual([NAME_FIELD, NOTES_FIELD, SOURCE_FIELD]);
    expect(view.fields[0]).toMatchObject({ label: "Your name", required: true, valueType: "text" });
    expect(view.fields[2].options).toEqual([
      { id: "web", label: "Website" },
      { id: "event", label: "Event" },
    ]);
    expect(view.badge).toBe(true);
    expect(JSON.stringify(view)).not.toContain(TYPE_ID);
  });

  it("drops a configured question whose field was deleted or turned into a calculation", () => {
    const view = presentPublicForm({
      config: createConfig({
        fields: [
          { fieldId: NAME_FIELD, label: "Name", helpText: null, required: true },
          { fieldId: FORMULA_FIELD, label: "Calculated", helpText: null, required: false },
        ],
      }),
      typeId: TYPE_ID,
      modelFields: model.fields,
      workspaceName: null,
      badge: false,
      renderToken: "token",
    });

    expect(view.fields.map((entry) => entry.fieldId)).toEqual([NAME_FIELD]);
  });
});
