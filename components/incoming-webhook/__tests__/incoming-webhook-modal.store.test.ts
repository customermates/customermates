import type { RootStore } from "@/core/stores/root.store";
import type { IncomingWebhookDto } from "@/features/incoming-webhook/incoming-webhook.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  manageIncomingWebhookAction: vi.fn(),
  getIncomingWebhooksAction: vi.fn(),
}));

vi.mock("../incoming-webhook-actions", () => actions);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { IncomingWebhookModalStore } from "../incoming-webhook-modal.store";

const LEADS = "10000000-0000-4000-8000-000000000001";
const DEALS = "10000000-0000-4000-8000-000000000002";
const EMAIL_FIELD = "20000000-0000-4000-8000-000000000001";
const NAME_FIELD = "20000000-0000-4000-8000-000000000002";
const WEBHOOK_ID = "30000000-0000-4000-8000-000000000001";

function webhook(overrides: Partial<IncomingWebhookDto> = {}): IncomingWebhookDto {
  return {
    id: WEBHOOK_ID,
    typeId: LEADS,
    name: "Typeform",
    enabled: true,
    url: "https://app.example.test/api/hooks/secret",
    hasSigningSecret: false,
    signatureHeader: "x-signature",
    mapping: {
      mode: "upsert",
      matchFieldId: EMAIL_FIELD,
      fields: [
        { path: "data.email", fieldId: EMAIL_FIELD },
        { path: "data.name", fieldId: NAME_FIELD },
      ],
    },
    samplePayload: { data: { email: "ada@example.com", name: "Ada" } },
    lastReceivedAt: null,
    createdAt: "2026-11-01T08:00:00.000Z",
    updatedAt: "2026-11-01T08:00:00.000Z",
    ...overrides,
  };
}

function makeStore() {
  const list = { upsertItem: vi.fn(), removeItem: vi.fn() };
  const rootStore = {
    registerModalStore: vi.fn(),
    localeStore: { getTranslation: (key: string) => key },
    userStore: { user: { id: "u", role: { isSystemRole: true } }, can: () => true },
    incomingWebhooksStore: list,
  } as unknown as RootStore;
  const store = new IncomingWebhookModalStore(rootStore);
  store.configure([
    { id: LEADS, label: "Leads" },
    { id: DEALS, label: "Deals" },
  ]);
  return { store, list };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("IncomingWebhookModalStore", () => {
  it("starts a new endpoint on the first list with one empty mapping row", () => {
    const { store } = makeStore();

    store.start();

    expect(store.isOpen).toBe(true);
    expect(store.form).toMatchObject({ id: "", typeId: LEADS, mode: "create", enabled: true });
    expect(store.form.rows).toEqual([{ path: "", fieldId: "" }]);
    expect(store.url).toBeNull();
    expect(store.request).toBeNull();
  });

  it("opens an existing endpoint with its mapping, address and sample", () => {
    const { store } = makeStore();

    store.start(webhook());

    expect(store.form).toMatchObject({ id: WEBHOOK_ID, mode: "upsert", matchFieldId: EMAIL_FIELD, hasSecret: false });
    expect(store.form.rows).toHaveLength(2);
    expect(store.form.sample).toContain("ada@example.com");
    expect(store.url).toBe("https://app.example.test/api/hooks/secret");
  });

  it("builds a create request from the mapped rows and keeps a typed secret and header", () => {
    const { store } = makeStore();
    store.start();
    store.onChange("name", " Typeform ");
    store.onChange("rows[0].path", " data.email ");
    store.onChange("rows[0].fieldId", EMAIL_FIELD);
    store.onChange("signingSecret", "  topsecret1 ");
    store.onChange("signatureHeader", "X-Hub-Signature");

    expect(store.request).toEqual({
      action: "create",
      typeId: LEADS,
      name: "Typeform",
      enabled: true,
      mapping: { mode: "create", matchFieldId: null, fields: [{ path: "data.email", fieldId: EMAIL_FIELD }] },
      signatureHeader: "x-hub-signature",
      signingSecret: "topsecret1",
    });
  });

  it("builds an update request that clears the secret on request", () => {
    const { store } = makeStore();
    store.start(webhook({ hasSigningSecret: true }));
    store.onChange("clearSecret", true);

    expect(store.request).toMatchObject({ action: "update", id: WEBHOOK_ID, signingSecret: null });
  });

  it("adds and removes mapping rows and starts over when the list changes", () => {
    const { store } = makeStore();
    store.start(webhook());

    store.addRow();
    expect(store.form.rows).toHaveLength(3);
    store.removeRow(0);
    expect(store.form.rows.map((row) => row.path)).toEqual(["data.name", ""]);

    store.onChange("typeId", DEALS);
    expect(store.form.rows).toEqual([{ path: "", fieldId: "" }]);
    expect(store.form.matchFieldId).toBe("");
  });

  it("lists the mapped fields as choices for the match field", () => {
    const { store } = makeStore();
    store.start(webhook());

    expect(store.mapped).toEqual([
      { value: EMAIL_FIELD, label: "data.email" },
      { value: NAME_FIELD, label: "data.name" },
    ]);
  });

  it("only allows a test with a valid mapped request and a valid, non-empty sample", () => {
    const { store } = makeStore();
    store.start(webhook());
    expect(store.canTest).toBe(true);

    store.onChange("sample", "{ not json");
    expect(store.sampleInvalid).toBe(true);
    expect(store.canTest).toBe(false);

    store.onChange("sample", "   ");
    expect(store.sampleInvalid).toBe(false);
    expect(store.canTest).toBe(false);
  });

  it("saves, keeps the modal open on the saved endpoint and updates the list", async () => {
    const { store, list } = makeStore();
    const saved = webhook();
    actions.manageIncomingWebhookAction.mockResolvedValue({ ok: true, data: { webhook: saved } });
    store.start();
    store.onChange("name", "Typeform");
    store.onChange("rows[0].path", "data.email");
    store.onChange("rows[0].fieldId", EMAIL_FIELD);

    await store.onSubmit();

    expect(actions.manageIncomingWebhookAction).toHaveBeenCalledWith(expect.objectContaining({ action: "create" }));
    expect(list.upsertItem).toHaveBeenCalledWith(saved, { created: true });
    expect(store.isOpen).toBe(true);
    expect(store.form.id).toBe(WEBHOOK_ID);
    expect(store.url).toBe(saved.url);
    expect(store.isLoading).toBe(false);
  });

  it("sends nothing while the form is not a valid request", async () => {
    const { store } = makeStore();
    store.start();

    await store.onSubmit();

    expect(actions.manageIncomingWebhookAction).not.toHaveBeenCalled();
  });

  it("saves and then tests with the sample, showing what would happen", async () => {
    const { store } = makeStore();
    const preview = { ok: true, outcome: "create", existingRecordId: null, values: [] };
    actions.manageIncomingWebhookAction
      .mockResolvedValueOnce({ ok: true, data: { webhook: webhook() } })
      .mockResolvedValueOnce({ ok: true, data: { preview } });
    store.start(webhook());

    await store.test();

    expect(actions.manageIncomingWebhookAction).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ action: "test", id: WEBHOOK_ID, payload: { data: { email: "ada@example.com", name: "Ada" } } }),
    );
    expect(store.preview).toEqual(preview);
  });

  it("replaces the secret address and updates the list row", async () => {
    const { store, list } = makeStore();
    const rotated = webhook({ url: "https://app.example.test/api/hooks/new" });
    actions.manageIncomingWebhookAction.mockResolvedValue({ ok: true, data: { webhook: rotated } });
    store.start(webhook());

    await store.rotate();

    expect(actions.manageIncomingWebhookAction).toHaveBeenCalledWith({
      action: "update",
      id: WEBHOOK_ID,
      rotateUrl: true,
    });
    expect(store.url).toBe(rotated.url);
    expect(list.upsertItem).toHaveBeenCalledWith(rotated, { created: false });
  });

  it("removes a deleted endpoint from the list only when the delete worked", async () => {
    const { store, list } = makeStore();
    actions.manageIncomingWebhookAction.mockResolvedValueOnce({ ok: false, error: { errors: [] } });

    expect(await store.deleteById(WEBHOOK_ID)).toBe(false);
    expect(list.removeItem).not.toHaveBeenCalled();

    actions.manageIncomingWebhookAction.mockResolvedValueOnce({ ok: true, data: { deleted: true } });

    expect(await store.deleteById(WEBHOOK_ID)).toBe(true);
    expect(list.removeItem).toHaveBeenCalledWith(WEBHOOK_ID);
  });
});
