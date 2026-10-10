import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const companyActions = vi.hoisted(() => ({
  deleteWebhookAction: vi.fn(),
  upsertWebhookAction: vi.fn(),
  getRecordModelAction: vi.fn(),
}));

vi.mock("../../../actions", () => companyActions);
vi.mock("@/app/[locale]/(protected)/records/actions", () => companyActions);

import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import { WebhookModalStore } from "../webhook-modal.store";

const NEW_WEBHOOK = {
  url: "",
  description: undefined,
  events: [],
  secret: undefined,
  headers: "",
  bodyTemplate: undefined,
  enabled: true,
};

const SAVED_WEBHOOK = {
  id: "30000000-0000-4000-8000-000000000001",
  url: "https://hooks.example.com/customermates",
  description: undefined,
  events: ["messaging.message.received" as const],
  secret: "saved-secret",
  headers: "",
  bodyTemplate: '{"text": "{{event}}"}',
  enabled: true,
};

function makeStore() {
  const rootStore = {
    registerModalStore: vi.fn(),
    webhooksStore: { upsertItem: vi.fn(), removeItem: vi.fn() },
  } as unknown as RootStore;

  return new WebhookModalStore(rootStore);
}

function submittedPayload() {
  return companyActions.upsertWebhookAction.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  companyActions.upsertWebhookAction.mockResolvedValue({ ok: true, data: { id: SAVED_WEBHOOK.id } });
});

describe("WebhookModalStore submit", () => {
  it("saves a new webhook without a secret or template after they were typed into and cleared", async () => {
    const store = makeStore();
    store.openWith(NEW_WEBHOOK);
    store.onChange("url", "https://hooks.example.com/new");
    store.onChange("events", ["messaging.message.received"]);
    store.onChange("secret", "abc");
    store.onChange("secret", "");
    store.onChange("bodyTemplate", '{"a": 1}');
    store.onChange("bodyTemplate", "  ");

    await store.onSubmit();

    const payload = submittedPayload();
    expect(payload).toMatchObject({ url: "https://hooks.example.com/new", events: ["messaging.message.received"] });
    expect(payload.secret).toBeUndefined();
    expect(payload.bodyTemplate).toBeUndefined();
    expect(store.isOpen).toBe(false);
  });

  it("keeps sending a typed secret and template unchanged", async () => {
    const store = makeStore();
    store.openWith(NEW_WEBHOOK);
    store.onChange("secret", "abc");
    store.onChange("bodyTemplate", '{"a": 1}');

    await store.onSubmit();

    expect(submittedPayload()).toMatchObject({ secret: "abc", bodyTemplate: '{"a": 1}' });
  });

  it("still sends an emptied saved secret or template, which the dialog cannot remove", async () => {
    const store = makeStore();
    store.openWith(SAVED_WEBHOOK);
    store.onChange("secret", "");
    store.onChange("bodyTemplate", "");

    await store.onSubmit();

    expect(submittedPayload()).toMatchObject({ id: SAVED_WEBHOOK.id, secret: "", bodyTemplate: "" });
  });
});

const COMPANY_ID = "30000000-0000-4000-8000-000000000010";
const model = createCrmPreset(COMPANY_ID);

describe("WebhookModalStore record triggers", () => {
  it("loads the current schema without erasing a draft and submits the exact definition", async () => {
    const store = makeStore();
    const trigger = {
      query: { typeId: presetId(COMPANY_ID, "service"), filters: [], relationships: [], search: "Ready" },
      changedFieldIds: [presetId(COMPANY_ID, "service.amount")],
    };
    store.openWith({ ...SAVED_WEBHOOK, events: ["record.updated"], recordTrigger: trigger });
    store.onChange("description", "Unsaved text");
    companyActions.getRecordModelAction.mockResolvedValue(model);
    await store.loadRecordModel();
    await store.onSubmit();
    expect(submittedPayload()).toMatchObject({
      description: "Unsaved text",
      recordTrigger: trigger,
      expectedSchemaRevision: model.revision,
    });
  });

  it("retains a draft on schema load failure, blocks submission and permits a retry", async () => {
    const store = makeStore();
    store.openWith({ ...SAVED_WEBHOOK, events: ["record.updated"], recordTrigger: null });
    store.onChange("description", "Keep this draft");
    companyActions.getRecordModelAction.mockRejectedValueOnce(new Error("offline"));
    await store.loadRecordModel();
    await store.onSubmit();
    expect(companyActions.upsertWebhookAction).not.toHaveBeenCalled();
    expect(store.modelLoadFailed).toBe(true);
    expect(store.form.description).toBe("Keep this draft");
    companyActions.getRecordModelAction.mockResolvedValue(model);
    await store.loadRecordModel();
    await store.onSubmit();
    expect(submittedPayload()).toMatchObject({
      recordTrigger: null,
      description: "Keep this draft",
      expectedSchemaRevision: 1,
    });
  });

  it("ignores an obsolete model request and clears fields when switching sources", async () => {
    const store = makeStore();
    let resolveOld!: (value: typeof model) => void;
    companyActions.getRecordModelAction.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
    );
    const old = store.loadRecordModel();
    store.cancelModelLoad();
    companyActions.getRecordModelAction.mockResolvedValue({ ...model, revision: 2 });
    await store.loadRecordModel();
    resolveOld(model);
    await old;
    expect(store.recordModel?.revision).toBe(2);
    store.openWith({
      ...SAVED_WEBHOOK,
      events: ["record.updated"],
      recordTrigger: {
        query: { typeId: presetId(COMPANY_ID, "service"), filters: [], relationships: [], search: "Old" },
        changedFieldIds: [presetId(COMPANY_ID, "service.amount")],
      },
    });
    store.onChange("recordTrigger.query.typeId", presetId(COMPANY_ID, "task"));
    expect(store.form.recordTrigger).toEqual({
      query: { typeId: presetId(COMPANY_ID, "task"), filters: [], relationships: [] },
      changedFieldIds: [],
    });
    store.onChange("events", ["messaging.message.received"]);
    await store.onSubmit();
    expect(submittedPayload()).toMatchObject({ recordTrigger: null });
    expect(submittedPayload().recordOwnerUserId).toBeUndefined();
    expect(submittedPayload().expectedSchemaRevision).toBeUndefined();
  });
});
