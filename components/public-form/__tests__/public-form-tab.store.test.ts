import type { PublicFormEditor } from "@/features/public-form/public-form.schema";
import type { PublicFormTabActions } from "../public-form-tab.store";

import { describe, expect, it, vi } from "vitest";

import { PublicFormTabStore } from "../public-form-tab.store";

import {
  COMPANY_FIELD,
  FORM_ID,
  NAME_FIELD,
  NOTE_FIELD,
  PEOPLE_NAME_FIELD,
  PEOPLE_TYPE,
  RELATIONSHIP,
  TEXTS,
  TYPE_ID,
  editor,
  rule,
  savedForm,
} from "./public-form-fixtures";

const CONSENT_TEXT = "I agree that my details are stored to answer my request.";

function build(data: PublicFormEditor = editor({ form: savedForm() }), rules = [rule()]) {
  const actions = {
    loadEditor: vi.fn().mockResolvedValue({ ok: true, data }),
    save: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    loadRules: vi.fn().mockResolvedValue({ ok: true, data: { items: rules } }),
  } satisfies PublicFormTabActions;
  return { actions, store: new PublicFormTabStore(TYPE_ID, actions) };
}

async function loaded(data?: PublicFormEditor, rules?: ReturnType<typeof rule>[]) {
  const built = build(data, rules);
  await built.store.load(TEXTS);
  return built;
}

describe("PublicFormTabStore draft", () => {
  it("starts from the saved form with its fields in the saved order and nothing edited", async () => {
    const { store } = await loaded();

    expect(store.draft?.title).toBe("Contact us");
    expect(store.draft?.fields.map((field) => [field.fieldId, field.included])).toEqual([
      [NOTE_FIELD, true],
      [NAME_FIELD, true],
      [COMPANY_FIELD, false],
    ]);
    expect(store.edited).toBe(false);
    expect(store.canSave).toBe(false);
  });

  it("starts a new form with the list's required fields and the default texts", async () => {
    const { store } = await loaded(editor());

    expect(store.draft?.title).toBe("Leads");
    expect(store.draft?.submitLabel).toBe("Send");
    expect(store.draft?.successMessage).toBe(TEXTS.successMessage);
    expect(store.draft?.enabled).toBe(true);
    expect(store.draft?.consentEnabled).toBe(false);
  });

  it("includes a required field of a new form wherever it sits in the list", async () => {
    const base = editor();
    const many = Array.from({ length: 7 }, (_, index) => ({
      ...base.fields[1],
      fieldId: `60000000-0000-4000-8000-0000000001${String(index).padStart(2, "0")}`,
      label: `Extra ${index}`,
    }));
    const { store } = await loaded(editor({ fields: [...many, base.fields[0]] }));

    expect(store.draft?.fields.find((field) => field.fieldId === NAME_FIELD)?.included).toBe(true);
    expect(store.draft?.fields.filter((field) => field.included)).toHaveLength(6);
  });

  it("cuts a list or field label that is longer than a form text may be, so a new form can be saved", async () => {
    const base = editor();
    const long = "A very long label ".repeat(11).trim();
    const { store } = await loaded(
      editor({ typeLabel: long, fields: [{ ...base.fields[0], label: long }, ...base.fields.slice(1)] }),
    );

    expect(long.length).toBeGreaterThan(120);
    expect(store.draft?.title.length).toBeLessThanOrEqual(120);
    expect(store.draft?.fields[0].label.length).toBeLessThanOrEqual(120);
    expect(store.config).not.toBeNull();
    expect(store.repairs).toEqual({ addedFields: [], droppedFields: [], person: null });
  });
});

describe("PublicFormTabStore after the list changed", () => {
  const person = {
    typeId: PEOPLE_TYPE,
    relationshipId: RELATIONSHIP,
    emailLabel: "Email",
    nameLabel: "Name",
    nameFieldId: PEOPLE_NAME_FIELD,
  };
  const withConfig = (patch: Partial<NonNullable<PublicFormEditor["form"]>["config"]>) =>
    savedForm({ config: { ...savedForm().config, ...patch } });

  it("adds a field the list made required after the form was saved, says so and can be saved at once", async () => {
    const base = editor();
    const nowRequired = base.fields.map((field) =>
      field.fieldId === COMPANY_FIELD ? { ...field, required: true, mustInclude: true } : field,
    );
    const { store, actions } = await loaded(editor({ form: savedForm(), fields: nowRequired }));

    expect(store.draft?.fields.find((field) => field.fieldId === COMPANY_FIELD)).toMatchObject({
      included: true,
      required: true,
    });
    expect(store.repairs).toEqual({ addedFields: ["Company"], droppedFields: [], person: null });
    expect(store.edited).toBe(true);
    expect(store.canSave).toBe(true);

    await store.save();
    expect(actions.save.mock.calls[0][0].config.fields.map((field: { fieldId: string }) => field.fieldId)).toEqual([
      NOTE_FIELD,
      NAME_FIELD,
      COMPANY_FIELD,
    ]);
  });

  it("leaves a required field with a default value out when the form did not ask for it", async () => {
    const base = editor();
    const defaulted = base.fields.map((field) =>
      field.fieldId === COMPANY_FIELD ? { ...field, required: true, mustInclude: false } : field,
    );
    const { store } = await loaded(editor({ form: savedForm(), fields: defaulted }));

    expect(store.draft?.fields.find((field) => field.fieldId === COMPANY_FIELD)?.included).toBe(false);
    expect(store.edited).toBe(false);
  });

  it("switches the person off when its list no longer qualifies, says so and can then be saved", async () => {
    const { store, actions } = await loaded(editor({ form: withConfig({ person }), peopleLists: [] }));

    expect(store.draft?.personEnabled).toBe(false);
    expect(store.repairs.person).toBe("dropped");
    expect(store.config?.person).toBeNull();
    expect(store.edited).toBe(true);

    await store.save();
    expect(actions.save).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, config: expect.objectContaining({ person: null }) }),
    );
  });

  it("switches a form off with the id and the switch alone, so nothing else about it is checked", async () => {
    const { store, actions } = await loaded(editor({ form: withConfig({ person }), peopleLists: [] }));

    store.patch({ enabled: false });

    expect(store.switchesOffOnly).toBe(true);
    expect(store.canSave).toBe(true);
    expect(await store.save()).toEqual({ status: "saved" });
    expect(actions.save).toHaveBeenCalledExactlyOnceWith({ id: FORM_ID, enabled: false });
  });

  it("can switch a form off even when the draft could not be saved as a form", async () => {
    const { store, actions } = await loaded();
    store.patch({ title: "" });
    expect(store.config).toBeNull();
    expect(store.switchesOffOnly).toBe(false);
    expect(await store.save()).toEqual({ status: "skipped" });

    store.patch({ title: "Contact us", enabled: false });

    expect(store.switchesOffOnly).toBe(true);
    expect(await store.save()).toEqual({ status: "saved" });
    expect(actions.save).toHaveBeenCalledExactlyOnceWith({ id: FORM_ID, enabled: false });
  });

  it("sends the definition with the switch when something else changed as well, or when the form is switched on", async () => {
    const edited = await loaded();
    edited.store.patch({ title: "Talk to us", enabled: false });
    await edited.store.save();

    const switchedOn = await loaded(editor({ form: { ...savedForm(), enabled: false } }));
    switchedOn.store.patch({ enabled: true });
    await switchedOn.store.save();

    expect(edited.store.switchesOffOnly).toBe(false);
    expect(edited.actions.save.mock.calls[0][0]).toMatchObject({ enabled: false, config: { title: "Talk to us" } });
    expect(switchedOn.actions.save.mock.calls[0][0]).toMatchObject({ enabled: true, config: { title: "Contact us" } });
  });

  it("does not keep the id of a people list that is gone when other lists remain", async () => {
    const other = { ...editor().peopleLists[0], typeId: "40000000-0000-4000-8000-000000000009", label: "Contacts" };
    const { store } = await loaded(editor({ form: withConfig({ person }), peopleLists: [other] }));

    expect(store.repairs.person).toBe("dropped");
    expect(store.draft).toMatchObject({
      personEnabled: false,
      personTypeId: other.typeId,
      personRelationshipId: other.relationships[0].id,
    });

    store.patch({ personEnabled: true });
    expect(store.config?.person).toMatchObject({ typeId: other.typeId, relationshipId: other.relationships[0].id });
  });

  it("picks a valid relationship when the stored one is gone and keeps the person on", async () => {
    const list = {
      ...editor().peopleLists[0],
      relationships: [{ id: "70000000-0000-4000-8000-000000000009", sourceLabel: "Leads", targetLabel: "People" }],
    };
    const { store } = await loaded(editor({ form: withConfig({ person }), peopleLists: [list] }));

    expect(store.repairs.person).toBe("adjusted");
    expect(store.draft).toMatchObject({
      personEnabled: true,
      personRelationshipId: "70000000-0000-4000-8000-000000000009",
    });
    expect(store.edited).toBe(true);
  });

  it("keeps a stored person without a name field empty, also through a save of another edit", async () => {
    const { store, actions } = await loaded(editor({ form: withConfig({ person: { ...person, nameFieldId: null } }) }));

    expect(store.draft?.personNameFieldId).toBe("");
    expect(store.repairs.person).toBeNull();
    expect(store.edited).toBe(false);

    store.patch({ title: "Talk to us" });
    expect(await store.save()).toEqual({ status: "saved" });

    expect(actions.save.mock.calls[0][0].config.person).toEqual({ ...person, nameFieldId: null });
  });

  it("offers the primary name field once the person is switched on for the first time", async () => {
    const { store } = await loaded(editor({ form: withConfig({ person: null }) }));

    store.patch({ personEnabled: true });

    expect(store.config?.person).toMatchObject({ nameFieldId: PEOPLE_NAME_FIELD });
  });

  it("names a question whose field left the list and keeps the form unedited", async () => {
    const gone = { fieldId: "60000000-0000-4000-8000-000000000099", label: "Budget", helpText: null, required: false };
    const { store } = await loaded(editor({ form: withConfig({ fields: [...savedForm().config.fields, gone] }) }));

    expect(store.repairs).toEqual({ addedFields: [], droppedFields: ["Budget"], person: null });
    expect(store.draft?.fields.map((field) => field.fieldId)).not.toContain(gone.fieldId);
    expect(store.edited).toBe(false);
  });

  it("is a guarded form for the navigation guard while it has edits", async () => {
    const { store } = await loaded();

    expect(store.withUnsavedChangesGuard).toBe(true);
    expect(store.hasUnsavedChanges).toBe(false);
    store.patch({ title: "" });
    expect(store.config).toBeNull();
    expect(store.hasUnsavedChanges).toBe(true);
  });
});

describe("PublicFormTabStore draft edits", () => {
  it("marks an edit as unsaved and a return to the saved text as clean again", async () => {
    const { store } = await loaded();

    store.patch({ title: "Talk to us" });
    expect(store.edited).toBe(true);
    expect(store.canSave).toBe(true);

    store.patch({ title: "Contact us" });
    expect(store.edited).toBe(false);
  });

  it("keeps an edit that cannot be saved yet marked as unsaved", async () => {
    const { store } = await loaded();

    store.patch({ title: "" });

    expect(store.config).toBeNull();
    expect(store.edited).toBe(true);
    expect(store.canSave).toBe(false);
  });

  it("changes the enabled switch through the same draft as every other setting", async () => {
    const { store } = await loaded();

    store.patch({ enabled: false });

    expect(store.draft?.enabled).toBe(false);
    expect(store.edited).toBe(true);
  });

  it("moves a question up or down and ignores a move past either end", async () => {
    const { store } = await loaded();

    store.moveField(1, -1);
    expect(store.draft?.fields.map((field) => field.fieldId)).toEqual([NAME_FIELD, NOTE_FIELD, COMPANY_FIELD]);
    store.moveField(0, -1);
    store.moveField(2, 1);
    expect(store.draft?.fields.map((field) => field.fieldId)).toEqual([NAME_FIELD, NOTE_FIELD, COMPANY_FIELD]);
    expect(store.edited).toBe(true);
  });
});

describe("PublicFormTabStore consent line", () => {
  it("adds the consent line with the default sentence in one step", async () => {
    const { store } = await loaded();

    store.addConsentLine(CONSENT_TEXT);

    expect(store.draft).toMatchObject({ consentEnabled: true, consentText: CONSENT_TEXT });
    expect(store.config).toBeNull();
  });

  it("keeps a sentence the person already wrote and removes the line again", async () => {
    const { store } = await loaded();

    store.patch({ consentText: "My own sentence." });
    store.addConsentLine(CONSENT_TEXT);
    expect(store.draft?.consentText).toBe("My own sentence.");

    store.removeConsentLine();
    expect(store.draft?.consentEnabled).toBe(false);
  });

  it("becomes saveable once the privacy notice link is added", async () => {
    const { store } = await loaded();

    store.addConsentLine(CONSENT_TEXT);
    store.patch({ privacyUrl: "https://example.com/privacy" });

    expect(store.config?.consent).toEqual({ text: CONSENT_TEXT, privacyUrl: "https://example.com/privacy" });
    expect(store.canSave).toBe(true);
  });
});

describe("PublicFormTabStore preview model", () => {
  it("shows the draft as the visitor will see it and follows every edit", async () => {
    const { store } = await loaded();

    expect(store.preview).toMatchObject({
      title: "Contact us",
      submitLabel: "Send",
      person: null,
      consent: null,
      badge: false,
    });
    expect(store.preview?.fields.map((field) => [field.fieldId, field.label, field.helpText, field.required])).toEqual([
      [NOTE_FIELD, "Note", null, false],
      [NAME_FIELD, "Name", "Your full name", true],
    ]);

    store.patch({ title: "Talk to us", submitLabel: "Go" });
    store.addConsentLine(CONSENT_TEXT);
    store.patch({ privacyUrl: "https://example.com/privacy" });

    expect(store.preview).toMatchObject({
      title: "Talk to us",
      submitLabel: "Go",
      consent: { text: CONSENT_TEXT, privacyUrl: "https://example.com/privacy" },
    });
  });

  it("leaves out a question that is switched off and shows the badge of a free plan", async () => {
    const { store } = await loaded(editor({ form: savedForm(), badge: true }));

    const fields = (store.draft?.fields ?? []).map((field) => ({ ...field, included: field.fieldId === NAME_FIELD }));
    store.patch({ fields });

    expect(store.preview?.fields.map((field) => field.fieldId)).toEqual([NAME_FIELD]);
    expect(store.preview?.badge).toBe(true);
  });

  it("shows the workspace byline and the Free badge of the live page, also before the first save", async () => {
    const saved = await loaded(editor({ form: savedForm(), workspaceName: "Acme GmbH" }));
    const unsaved = await loaded(editor({ workspaceName: "Acme GmbH", badge: true }));

    expect(saved.store.preview?.workspaceName).toBe("Acme GmbH");
    expect(unsaved.store.preview).toMatchObject({ workspaceName: "Acme GmbH", badge: true });
  });

  it("asks for the email, and the name when a label is set, once the person is on", async () => {
    const { store } = await loaded();

    store.patch({ personEnabled: true });

    expect(store.preview?.person).toEqual({ emailLabel: "Email", nameLabel: "Name" });
  });

  it("switches the preview between the form and the done message", async () => {
    const { store } = await loaded();

    expect(store.previewMode).toBe("form");
    store.setPreviewMode("done");
    expect(store.previewMode).toBe("done");
  });
});

describe("PublicFormTabStore after submit", () => {
  it("chains the record, the person and who is notified, with the rules that listen to this form", async () => {
    const { store } = await loaded(editor({ form: savedForm() }), [
      rule(),
      rule({
        id: "80000000-0000-4000-8000-000000000002",
        name: "Other form",
        trigger: { kind: "formSubmitted", sourceId: "50000000-0000-4000-8000-0000000000ff" },
      }),
    ]);
    store.patch({ personEnabled: true, personTypeId: PEOPLE_TYPE });

    expect(store.chain).toEqual({
      createsRecord: true,
      personListLabel: "People",
      recipients: { owners: ["Test User"], assignees: false, members: 0 },
      rules: [
        {
          id: "80000000-0000-4000-8000-000000000001",
          name: "Tell me about new leads",
          enabled: true,
          href: "/automations?open=80000000-0000-4000-8000-000000000001",
        },
      ],
    });
  });

  it("reads no person step while the person is off and survives a failed rules read", async () => {
    const built = build();
    built.actions.loadRules.mockRejectedValue(new Error("no access"));
    await built.store.load(TEXTS);

    expect(built.store.chain).toMatchObject({ personListLabel: null, recipients: null, rules: [] });
  });

  it("treats a denied rules read as no automations", async () => {
    const built = build();
    built.actions.loadRules.mockResolvedValue({ ok: false, error: {} });
    await built.store.load(TEXTS);

    expect(built.store.chain?.rules).toEqual([]);
  });
});

describe("PublicFormTabStore load and save", () => {
  it("reports a failed load and keeps the editor empty", async () => {
    const built = build();
    built.actions.loadEditor.mockResolvedValue({ ok: false, error: { errors: ["x"] } });

    const outcome = await built.store.load(TEXTS);

    expect(outcome).toEqual({ status: "failed", error: { errors: ["x"] } });
    expect(built.store.editor).toBeNull();
    expect(built.store.draft).toBeNull();
  });

  it("keeps the answer of the newest load", async () => {
    const built = build();
    let answerFirst: (value: unknown) => void = () => undefined;
    built.actions.loadEditor.mockImplementationOnce(() => new Promise((resolve) => (answerFirst = resolve)));
    built.actions.loadEditor.mockResolvedValueOnce({ ok: true, data: editor({ form: savedForm() }) });

    const first = built.store.load(TEXTS);
    const second = await built.store.load(TEXTS);
    answerFirst({ ok: true, data: editor() });

    expect(second).toEqual({ status: "loaded" });
    expect(await first).toEqual({ status: "stale" });
    expect(built.store.draft?.title).toBe("Contact us");
  });

  it("saves an existing form by id with the enabled switch and the valid config", async () => {
    const { store, actions } = await loaded();
    store.patch({ title: "Talk to us", enabled: false });

    expect(await store.save()).toEqual({ status: "saved" });

    expect(actions.save).toHaveBeenCalledOnce();
    expect(actions.save.mock.calls[0][0]).toMatchObject({
      id: FORM_ID,
      enabled: false,
      config: { title: "Talk to us" },
    });
    expect(store.saving).toBe(false);
  });

  it("creates the form of a list that has none, named after its title", async () => {
    const { store, actions } = await loaded(editor());
    store.patch({ title: "  Sales enquiries  " });

    await store.save();

    expect(actions.save.mock.calls[0][0]).toMatchObject({ typeId: TYPE_ID, name: "Sales enquiries", enabled: true });
    expect(actions.save.mock.calls[0][0]).not.toHaveProperty("id");
  });

  it("returns the server's refusal and clears the saving flag", async () => {
    const { store, actions } = await loaded();
    actions.save.mockResolvedValue({ ok: false, error: { errors: ["bad"] } });

    expect(await store.save()).toEqual({ status: "failed", error: { errors: ["bad"] } });
    expect(store.saving).toBe(false);
  });

  it("does not save an incomplete draft or save twice at once", async () => {
    const { store, actions } = await loaded();

    store.patch({ title: "" });
    expect(await store.save()).toEqual({ status: "skipped" });

    store.patch({ title: "Talk to us" });
    const first = store.save();
    expect(await store.save()).toEqual({ status: "skipped" });
    await first;
    expect(actions.save).toHaveBeenCalledOnce();
  });
});
