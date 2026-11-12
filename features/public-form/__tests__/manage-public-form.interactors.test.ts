import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
  createMockDiModule,
} from "@/tests/helpers/interactor-test-setup";

let mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

import { CustomErrorCode } from "@/core/validation/validation.types";
import { Action, Resource } from "@/generated/prisma";
import { DisablePublicFormInteractor } from "../disable-public-form.interactor";
import { GetPublicFormEditorInteractor } from "../get-public-form-editor.interactor";
import { GetPublicFormInteractor } from "../get-public-form.interactor";
import { ListPublicFormsInteractor } from "../list-public-forms.interactor";
import { UNLIMITED_PUBLIC_FORM_QUOTA } from "../public-form-quota";
import { UpsertPublicFormInteractor } from "../upsert-public-form.interactor";
import {
  FORM_ID,
  NOTES_FIELD,
  PEOPLE_TYPE_ID,
  PERSON_NAME_FIELD,
  RELATION_ID,
  SECRET,
  TYPE_ID,
  USER_ID,
  createConfig,
  createModel,
  failureCodeOf,
} from "./public-form-fixtures";

const now = new Date("2026-11-13T10:00:00.000Z");
const settings = { baseUrl: "https://app.example.com", authSecret: SECRET, now: () => now };

function stored(overrides: Record<string, unknown> = {}) {
  return {
    id: FORM_ID,
    typeId: TYPE_ID,
    name: "Contact form",
    createdById: USER_ID,
    enabled: true,
    config: createConfig(),
    consentVersion: 2,
    submissionCount: 5,
    lastSubmittedAt: new Date("2026-11-12T08:00:00.000Z"),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function repo(existing: ReturnType<typeof stored> | null = null, extra: Record<string, unknown> = {}) {
  return {
    findForm: vi.fn(() => Promise.resolve(existing)),
    findFormOfType: vi.fn(() => Promise.resolve(existing)),
    listForms: vi.fn(() => Promise.resolve(existing ? [existing] : [])),
    createForm: vi.fn((data: Record<string, unknown>) => Promise.resolve(stored(data))),
    updateForm: vi.fn((_id: string, patch: Record<string, unknown>) =>
      Promise.resolve(stored({ ...existing, ...patch })),
    ),
    countSubmissionsSince: vi.fn(() => Promise.resolve(7)),
    publicLinksAllowed: vi.fn(() => Promise.resolve(true)),
    ...extra,
  };
}

const records = (model = createModel()) => ({ getModel: vi.fn(() => Promise.resolve(model)) });
const policy = (allowed = true) => ({
  load: () => Promise.resolve({ actor: { id: USER_ID }, allowed: () => allowed, canReadType: () => true }),
});

beforeEach(() => {
  vi.clearAllMocks();
  mockUser = createMockUserWithPermissions([{ resource: Resource.publicLinks, action: Action.create }]);
});

describe("UpsertPublicFormInteractor", () => {
  function interactor(formRepo = repo(), options: { allowed?: boolean; model?: ReturnType<typeof createModel> } = {}) {
    return new UpsertPublicFormInteractor(
      formRepo as never,
      records(options.model) as never,
      policy(options.allowed) as never,
      UNLIMITED_PUBLIC_FORM_QUOTA,
      settings,
    );
  }

  it("creates the form of a list and returns its public link and embed snippet", async () => {
    const formRepo = repo();

    const result = await interactor(formRepo).invoke({ typeId: TYPE_ID, name: "Contact form", config: createConfig() });

    expect(result.ok).toBe(true);
    expect(formRepo.createForm).toHaveBeenCalledWith({
      typeId: TYPE_ID,
      name: "Contact form",
      enabled: true,
      config: createConfig(),
    });
    if (!result.ok) return;
    expect(result.data.url).toMatch(/^https:\/\/app\.example\.com\/f\/[0-9a-f]{64}$/u);
    expect(result.data.embedSnippet).toContain("<iframe");
    expect(result.data.embedSnippet).toContain("embed=1");
    expect(result.data.usage).toEqual({ submissionsThisMonth: 7, monthlyLimit: null, badge: false });
  });

  it("puts the link in the language of a form with a fixed language", async () => {
    const result = await interactor().invoke({
      typeId: TYPE_ID,
      name: "Kontakt",
      config: createConfig({ locale: "de" }),
    });

    expect(result.ok && result.data.url).toMatch(/^https:\/\/app\.example\.com\/de\/f\//u);
  });

  it("allows one form per list", async () => {
    const result = await interactor(repo(stored())).invoke({ typeId: TYPE_ID, name: "Second", config: createConfig() });

    expect(result).toMatchObject({ ok: false, error: { issues: [{ path: ["typeId"] }] } });
    expect(failureCodeOf(result)).toBe(CustomErrorCode.publicFormExists);
  });

  it("refuses a list that does not exist or is in Trash", async () => {
    const result = await interactor(repo(), { model: createModel({ types: [] }) }).invoke({
      typeId: TYPE_ID,
      name: "Contact form",
      config: createConfig(),
    });

    expect(result.ok).toBe(false);
    expect(failureCodeOf(result)).toBe(CustomErrorCode.recordTypeNotFound);
  });

  it("refuses a member who may not create records in the list", async () => {
    const formRepo = repo();
    const result = await interactor(formRepo, { allowed: false }).invoke({
      typeId: TYPE_ID,
      name: "Contact form",
      config: createConfig(),
    });

    expect(result.ok).toBe(false);
    expect(failureCodeOf(result)).toBe(CustomErrorCode.permissionDenied);
    expect(formRepo.createForm).not.toHaveBeenCalled();
  });

  it("refuses a member without the public links permission", async () => {
    mockUser = createMockUserWithPermissions([]);

    await expect(
      interactor().invoke({ typeId: TYPE_ID, name: "Contact form", config: createConfig() }),
    ).rejects.toThrow(/Access denied/u);
  });

  it("rejects a question that is not a usable field of the list", async () => {
    const result = await interactor().invoke({
      typeId: TYPE_ID,
      name: "Contact form",
      config: createConfig({
        fields: [{ fieldId: PERSON_NAME_FIELD, label: "Other list", helpText: null, required: false }],
      }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(failureCodeOf(result)).toBe(CustomErrorCode.publicFormConfigurationInvalid);
    expect(result.error.issues[0].path).toEqual(["config", "fields", "0", "fieldId"]);
  });

  it("does not turn a form on when the workspace turned public links off", async () => {
    const formRepo = repo(null, { publicLinksAllowed: vi.fn(() => Promise.resolve(false)) });

    const result = await interactor(formRepo).invoke({ typeId: TYPE_ID, name: "Contact form", config: createConfig() });

    expect(result.ok).toBe(false);
    expect(formRepo.createForm).not.toHaveBeenCalled();
  });

  it("can still save a form that is turned off while public links are blocked", async () => {
    const formRepo = repo(null, { publicLinksAllowed: vi.fn(() => Promise.resolve(false)) });

    const result = await interactor(formRepo).invoke({
      typeId: TYPE_ID,
      name: "Contact form",
      enabled: false,
      config: createConfig(),
    });

    expect(result.ok).toBe(true);
  });

  it("answers not found for an id that does not exist", async () => {
    const result = await interactor(repo(null)).invoke({ id: FORM_ID, name: "Renamed" });

    expect(result.ok).toBe(false);
    expect(failureCodeOf(result)).toBe(CustomErrorCode.publicFormNotFound);
  });

  it("raises the consent version when the consent text or link changes, and only then", async () => {
    const formRepo = repo(stored());

    await interactor(formRepo).invoke({
      id: FORM_ID,
      config: createConfig({ consent: { text: "New wording.", privacyUrl: "https://example.com/privacy" } }),
    });
    expect(formRepo.updateForm).toHaveBeenLastCalledWith(FORM_ID, expect.objectContaining({ consentVersion: 3 }));

    await interactor(formRepo).invoke({ id: FORM_ID, config: createConfig({ submitLabel: "Go" }) });
    expect(formRepo.updateForm.mock.calls.at(-1)?.[1]).not.toHaveProperty("consentVersion");
  });

  it("keeps the stored definition when only the name or state changes", async () => {
    const formRepo = repo(stored());

    await interactor(formRepo).invoke({ id: FORM_ID, enabled: false });

    expect(formRepo.updateForm).toHaveBeenCalledWith(FORM_ID, { enabled: false });
  });

  it("validates the person link against the data model", async () => {
    const result = await interactor().invoke({
      typeId: TYPE_ID,
      name: "Contact form",
      config: createConfig({
        fields: [{ fieldId: NOTES_FIELD, label: "Message", helpText: null, required: false }],
        person: {
          typeId: PEOPLE_TYPE_ID,
          relationshipId: RELATION_ID,
          emailLabel: "Email",
          nameLabel: "Name",
          nameFieldId: PERSON_NAME_FIELD,
        },
      }),
    });

    expect(result.ok).toBe(true);
  });
});

describe("DisablePublicFormInteractor", () => {
  const build = (formRepo = repo(stored())) =>
    new DisablePublicFormInteractor(formRepo as never, UNLIMITED_PUBLIC_FORM_QUOTA, settings);

  it("turns the form off", async () => {
    const formRepo = repo(stored());

    const result = await build(formRepo).invoke({ id: FORM_ID });

    expect(formRepo.updateForm).toHaveBeenCalledWith(FORM_ID, { enabled: false });
    expect(result.ok && result.data.enabled).toBe(false);
  });

  it("is idempotent for a form that is already off", async () => {
    const formRepo = repo(stored({ enabled: false }));

    const result = await build(formRepo).invoke({ id: FORM_ID });

    expect(formRepo.updateForm).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it("answers not found for an unknown form", async () => {
    const result = await build(repo(null)).invoke({ id: FORM_ID });

    expect(result.ok).toBe(false);
  });
});

describe("ListPublicFormsInteractor and GetPublicFormInteractor", () => {
  it("lists the forms with their usage and skips a form whose stored definition no longer parses", async () => {
    const formRepo = repo(stored());
    formRepo.listForms.mockResolvedValue([
      stored(),
      stored({ id: "00000000-0000-4000-8000-0000000000f9", config: {} }),
    ]);

    const result = await new ListPublicFormsInteractor(formRepo as never, UNLIMITED_PUBLIC_FORM_QUOTA, settings).invoke(
      {},
    );

    expect(result.ok && result.data.items.map((item) => item.id)).toEqual([FORM_ID]);
  });

  it("reads one form with its link and counters", async () => {
    const result = await new GetPublicFormInteractor(
      repo(stored()) as never,
      UNLIMITED_PUBLIC_FORM_QUOTA,
      settings,
    ).invoke({
      id: FORM_ID,
    });

    expect(result.ok && result.data).toMatchObject({
      id: FORM_ID,
      submissionCount: 5,
      lastSubmittedAt: "2026-11-12T08:00:00.000Z",
      consentVersion: 2,
    });
  });
});

describe("GetPublicFormEditorInteractor", () => {
  const build = (formRepo = repo(stored()), options: { allowed?: boolean } = {}) =>
    new GetPublicFormEditorInteractor(
      formRepo as never,
      records() as never,
      policy(options.allowed) as never,
      UNLIMITED_PUBLIC_FORM_QUOTA,
      settings,
    );

  it("returns the usable fields, the people lists and the current form", async () => {
    const result = await build().invoke({ typeId: TYPE_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ typeLabel: "Lead", allowed: true, reason: null });
    expect(result.data.fields.length).toBeGreaterThan(3);
    expect(result.data.peopleLists.map((entry) => entry.typeId)).toEqual([PEOPLE_TYPE_ID]);
    expect(result.data.form?.id).toBe(FORM_ID);
  });

  it("says why the editor is blocked without leaking the form", async () => {
    const blocked = repo(stored(), { publicLinksAllowed: vi.fn(() => Promise.resolve(false)) });

    const workspace = await build(blocked).invoke({ typeId: TYPE_ID });
    expect(workspace.ok && workspace.data).toMatchObject({
      allowed: false,
      reason: "workspaceDisabled",
      form: null,
      fields: [],
    });

    const member = await build(repo(stored()), { allowed: false }).invoke({ typeId: TYPE_ID });
    expect(member.ok && member.data).toMatchObject({ allowed: false, reason: "permissionDenied", form: null });
  });

  it("answers not found for a list the member cannot read", async () => {
    const result = await new GetPublicFormEditorInteractor(
      repo() as never,
      records(createModel({ types: [] })) as never,
      policy() as never,
      UNLIMITED_PUBLIC_FORM_QUOTA,
      settings,
    ).invoke({ typeId: TYPE_ID });

    expect(result.ok).toBe(false);
  });
});
